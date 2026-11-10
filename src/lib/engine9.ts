import { env } from "cloudflare:workers";
import PersonWorker from "@engine9/core/PersonWorker";
import pluginEntries, { packageVersions } from "@engine9/core/plugins/site";
import { createPluginRegistry } from "@engine9/core/pluginRegistry";
import { DEFAULT_CORE_SCHEMAS } from "@engine9/core/stackMetadata";
import { SqlApiKeyStore } from "@engine9/core/auth";
import { createDelegateAuth } from "@engine9/core/auth/delegate";
import { BatchLogger } from "@engine9/core/logging";
import { createApi } from "@engine9/core/api";
import { LOGIN_PROVIDERS, SIGN_IN_BRAND } from "./brand";

export {
  ADMIN_SEGMENT_ID,
  DEMO_API_KEY,
  DEMO_PUBLIC_API_KEY,
  FESTIVAL_PLUGIN_ID,
  LEVEL_GATES,
  ROLE_ORDER,
  ROLE_REGISTRY,
  VIP_SEGMENT_ID,
} from "./roles";
import {
  DEMO_PUBLIC_API_KEY,
  FESTIVAL_PLUGIN_ID,
  ROLE_REGISTRY,
  VIP_SEGMENT_ID,
} from "./roles";

/**
 * Engine9 client wiring for the festival demo.
 *
 * The D1 binding (festival-db) IS the engine9 database: migration
 * 0003_engine9.sql installed the standard Engine9 tables and seeded
 * the plugin row, a demo API key, and a VIP segment. The client API exposes
 * people writes, person-related upserts, and segment-gated reads under /api.
 */

/**
 * Plugins compiled into this build. `e9core build-plugins` writes
 * `engine9.plugins.js` from `@engine9/schemas` (package.json
 * `engine9.pluginPackages`). Vite and wrangler alias
 * `@engine9/core/plugins/site` to that file. The stub export is null.
 */
const plugins = pluginEntries
  ? createPluginRegistry(pluginEntries, { packageVersions: packageVersions || {} })
  : null;

/**
 * The PersonWorker runs the inbound person pipeline against D1.
 * Core loads plugin code from `plugins`.
 */
export function createPersonWorker() {
  return new PersonWorker({ accountId: "festival-demo", d1: env.DB, plugins });
}

let standardPlugins: Promise<void> | undefined;

/**
 * One query: are the standard person schema plugins already installed? A
 * site's database is installed once (migration 0003, then `e9core upgrade`
 * after a release), so on almost every cold Worker the answer is yes and the
 * login skips `installDefaultPlugins`, which diffs every table of every
 * plugin (dozens of D1 round trips). A missing `plugin` table, a missing row,
 * or any error means "not sure": install.
 */
async function standardPluginsInstalled(
  worker: ReturnType<typeof createPersonWorker>,
): Promise<boolean> {
  try {
    const paths: string[] = DEFAULT_CORE_SCHEMAS;
    const { data } = await worker.query({
      sql: `select path from plugin where path in (${paths.map(() => "?").join(",")})`,
      values: paths,
    });
    const have = new Set((data as { path: string }[]).map((row) => row.path));
    return paths.every((path) => have.has(path));
  } catch {
    return false;
  }
}

/**
 * Make sure the published person schema plugins (plugin rows + inbound
 * snapshots) are installed, once per isolate. The seeded
 * `@demo/festival-website` row is attribution for writes; it is not an
 * inbound people plugin. `POST /people` and login need the standard schema
 * plugins installed. Already installed (the normal case) costs one query;
 * schema changes from a new release are applied by `e9core upgrade`, not by
 * a visitor's login.
 */
export function ensureStandardPlugins(): Promise<void> {
  if (standardPlugins) return standardPlugins;
  const worker = createPersonWorker();
  const pending = standardPluginsInstalled(worker)
    .then((installed) => (installed ? undefined : worker.installDefaultPlugins()))
    .then(() => undefined)
    .catch((err: unknown) => {
      standardPlugins = undefined;
      throw err;
    });
  standardPlugins = pending;
  return pending;
}

/**
 * All sign-in, session, and role logic lives in @engine9/core. This is pure
 * configuration: which delegate to trust, which secret signs the session,
 * which plugin records the logins, and which segments are roles. The
 * middleware gate (`requireRole`) and the API under /api share it.
 */
export function delegateAuth() {
  return createDelegateAuth({
    worker: createPersonWorker(),
    delegateUrl: env.DELEGATE_URL || "https://delegate.network",
    sessionSecret: env.SESSION_SECRET,
    pluginId: FESTIVAL_PLUGIN_ID,
    remoteInputId: "delegate-login",
    roles: ROLE_REGISTRY,
  });
}

/** Share fields every festival login requires. There are no optional fields. */
export const LOGIN_FIELDS = ["display_name", "email"];

/** Where a sign-in that did not start on a gated page lands: it sends the person on. */
export const AFTER_SIGN_IN = "/signed-in";

/**
 * `@engine9/id`'s `core` option for every browser client on this site.
 *
 * `session: "cookie"` is the recommended setting for any site with a server:
 * core sets its HttpOnly `e9_session` cookie, the same session the redirect
 * sign-in (`/api/auth/start`) sets, so the middleware gate sees the person
 * however they signed in. Each login starts with `POST /api/auth/begin`, so
 * the Identity Token must carry a nonce core issued to this browser. The
 * public key may be in page JavaScript: it can add people and log in,
 * nothing else.
 */
export const BROWSER_CORE = {
  apiUrl: "/api",
  publicApiKey: DEMO_PUBLIC_API_KEY,
  session: "cookie",
} as const;

export function createEngine9Api() {
  const worker = createPersonWorker();
  // Keys live in the api_key table (SqlApiKeyStore; D1, SQLite, or MySQL).
  const keyStore = new SqlApiKeyStore({ worker });
  // Cloudflare-style batch logging. The demo has no R2 bucket, so each
  // request's batch goes to the Worker log stream (wrangler tail /
  // observability). With R2: new BatchLogger({ sink: r2Sink(env.LOG_BUCKET) })
  const logger = new BatchLogger({
    sink: (records: unknown[]) => console.log("engine9-modifications", JSON.stringify(records)),
  });
  return createApi({
    worker,
    keyStore,
    logger,
    delegateAuth: delegateAuth(),
    config: {
      // GET /api/auth/start and /api/auth/callback: the redirect sign-in.
      // Everything Delegate is asked for comes from here, never the URL.
      signIn: {
        minLevel: 1,
        fields: LOGIN_FIELDS,
        loginProviders: LOGIN_PROVIDERS,
        brand: SIGN_IN_BRAND,
      },
      pluginId: FESTIVAL_PLUGIN_ID,
      defaultRemoteInputId: "festival-website",
      roles: ROLE_REGISTRY,
      upsertTables: ["person_email", "person_phone", "person_address", "person_segment"],
      reads: {
        // VIP-only sets, gated by VIP segment membership; the person_id is
        // supplied by the caller (the delegate-style session), never looked up
        "vip-performances": {
          table: "performance",
          segmentId: VIP_SEGMENT_ID,
          columns: ["*"],
          where: "vip_only = 1",
          orderBy: "start_time",
        },
        // Public content read (no segment gate)
        lineup: { table: "artist", columns: ["id", "name", "genre", "blurb"] },
      },
    },
  });
}
