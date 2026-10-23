import { env } from "cloudflare:workers";
import PersonWorker from "@engine9/core/PersonWorker";
import pluginEntries, { packageVersions } from "@engine9/core/plugins/site";
import { createPluginRegistry } from "@engine9/core/pluginRegistry";
import { DEFAULT_CORE_SCHEMAS } from "@engine9/core/stackMetadata";
import { SqlApiKeyStore } from "@engine9/core/auth";
import { createDelegateAuth } from "@engine9/core/auth/delegate";
import { BatchLogger } from "@engine9/core/logging";
import { createApi } from "@engine9/core/api";
import { REDIRECT_SIGN_IN_BRAND } from "./brand";

export {
  ADMIN_SEGMENT_ID,
  DEMO_API_KEY,
  DEMO_PUBLIC_API_KEY,
  FESTIVAL_PLUGIN_ID,
  ROLE_ORDER,
  ROLE_REGISTRY,
  VIP_SEGMENT_ID,
} from "./roles";
import {
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
 * All delegate login/session/role logic lives in @engine9/core; this is pure
 * configuration: which delegate to trust, which secrets to use, which plugin
 * records the logins, which segments count as roles, and that demo roles are
 * session-scoped (re-prompted every login). `createApi({ delegate })` is the
 * default when those extras are not needed; this demo passes `delegateAuth`
 * so `loadRolesOnLogin` stays false.
 */
export function delegateAuth() {
  return createDelegateAuth({
    worker: createPersonWorker(),
    delegateUrl: env.DELEGATE_URL || "https://delegate.network",
    sessionSecret: env.SESSION_SECRET,
    pluginId: FESTIVAL_PLUGIN_ID,
    remoteInputId: "delegate-login",
    roles: ROLE_REGISTRY,
    // Demo session roles: every login starts empty so /choose-role re-prompts.
    loadRolesOnLogin: false,
  });
}

/** Share fields every festival login requires. There are no optional fields. */
export const LOGIN_FIELDS = ["display_name", "email"];

/**
 * Delegate authorize URL for this site's login. Lands on `/auth/delegate`.
 * `prompt: "select"` is "Change your Delegate information": delegate always
 * shows its share page, so the person can pick another email address.
 * `again` marks a login restarted after an unrecognized `state`, so a browser
 * that drops the state cookie stops after one retry. Use `startLogin()` in
 * `session.ts`, which also sets that cookie.
 */
export function loginIdentityUrl(
  origin: string,
  opts: { prompt?: "select"; state?: string; again?: boolean } = {},
) {
  const returnTo = new URL("/auth/delegate", origin);
  if (opts.again) returnTo.searchParams.set("again", "1");
  return delegateAuth().identityUrl({
    returnTo: returnTo.toString(),
    minLevel: 1,
    fields: LOGIN_FIELDS,
    prompt: opts.prompt,
    brand: REDIRECT_SIGN_IN_BRAND,
    state: opts.state,
    responseMode: "query",
  });
}

export function createEngine9Api() {
  const worker = createPersonWorker();
  // Canonical: api_key table via SqlApiKeyStore (works on D1/SQLite/MySQL).
  // Cloudflare KVApiKeyStore is optional and unused here.
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
