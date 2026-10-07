// @ts-check
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Read PORT from .env files (Vite precedence; later files override). */
function readPortFromEnvFiles(mode) {
  const files = [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];
  let port;
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^PORT\s*=\s*"?(\d+)"?\s*(?:#.*)?$/);
      if (match) port = match[1];
    }
  }
  return port;
}

const mode = process.env.NODE_ENV ?? "development";
const filePort = readPortFromEnvFiles(mode);
// Shell/CLI wins; otherwise use PORT from .env (loadEnv can miss it at config time).
const explicitPort = process.env.PORT ?? filePort;
const port = explicitPort ? Number(explicitPort) : 3000;
const strictPort = Boolean(explicitPort);

const inputToolsShim = fileURLToPath(
  import.meta.resolve("@engine9/core/cloudflare/input-tools-shim")
);
const unavailableModule = fileURLToPath(
  import.meta.resolve("@engine9/core/cloudflare/unavailable-module")
);
const countriesBrowser = fileURLToPath(
  import.meta.resolve("i18n-iso-countries/index.js")
);
/** Written by `e9core build-plugins` before `astro build` / `astro dev`. */
const pluginRegistry = join(root, "engine9.plugins.js");

// All pages are server-rendered so that VIP/Admin gating happens on the
// server, never in client JS. The Cloudflare adapter runs dev in workerd and
// exposes the D1 binding (a local SQLite file under .wrangler/state) during
// `astro dev`, so the same code runs locally under Node and on Workers.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  server: {
    port,
  },
  vite: {
    server: {
      port,
      // When PORT is unset, try 3000 then 3001/3002 (Delegate allowlist).
      strictPort,
    },
    resolve: {
      alias: [
        // The @engine9/schemas transforms import @engine9/input-tools,
        // whose index pulls server-only deps (AWS SDK, archiver, googleapis).
        // The shim re-exports the portable pieces. Exact match only --
        // subpaths like @engine9/input-tools/timelineTypes.js stay intact.
        { find: /^@engine9\/input-tools$/, replacement: inputToolsShim },
        // Compiled plugin registry (engine9.plugins.js). The package stub
        // exports null; without this alias login fails with PLUGIN_CONFIG_INVALID.
        { find: /^@engine9\/core\/plugins\/site$/, replacement: pluginRegistry },
        // Node-only DB drivers behind SQLWorker's lazy non-D1 connection
        // modes; never reached on Workers, stubbed so the bundle resolves
        { find: /^knex$/, replacement: unavailableModule },
        { find: /^mysql2$/, replacement: unavailableModule },
        { find: /^mysql2\/promise$/, replacement: unavailableModule },
        { find: /^better-sqlite3$/, replacement: unavailableModule },
        // person_address imports the package root, which require()s every
        // locale. index.js is the browser build.
        { find: /^i18n-iso-countries$/, replacement: countriesBrowser },
      ],
    },
  },
});
