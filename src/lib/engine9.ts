import { env } from "cloudflare:workers";
import PersonWorker from "@engine9/core/PersonWorker";
import pluginEntries, { packageVersions } from "@engine9/core/plugins/site";
import { createPluginRegistry } from "@engine9/core/pluginRegistry";
import { SqlApiKeyStore } from "@engine9/core/auth";
import { createDelegateAuth } from "@engine9/core/auth/delegate";
import { BatchLogger } from "@engine9/core/logging";
import { createApi } from "@engine9/core/api";

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
 * Install the published person schema plugins (plugin rows + inbound snapshots)
 * once per isolate. The seeded `@demo/festival-website` row is attribution
 * for writes; it is not an inbound people plugin. `POST /people` and login
 * need the standard schema plugins installed.
 */
export function ensureStandardPlugins(): Promise<void> {
  if (!standardPlugins) {
    const worker = createPersonWorker();
    standardPlugins = worker
      .installStandard()
      .then(() => undefined)
      .catch((err: unknown) => {
        standardPlugins = undefined;
        throw err;
      });
  }
  return standardPlugins;
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
    delegateUrl: env.DELEGATE_URL || "https://delegate.engine9.ai",
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
 */
export function loginIdentityUrl(origin: string, opts: { prompt?: "select" } = {}) {
  return delegateAuth().identityUrl({
    returnTo: new URL("/auth/delegate", origin).toString(),
    minLevel: 1,
    fields: LOGIN_FIELDS,
    prompt: opts.prompt,
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
