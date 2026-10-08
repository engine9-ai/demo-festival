# Deploying @engine9/core on this site

This demo doubles as the reference installation of the engine9 client on a
"real" website. The D1 database (`festival-db`) **is** the engine9 database:
migration `0003_engine9.sql` installed the standard engine9 tables
alongside the site's own content tables, and the site now serves the engine9
client API under `/api` from the same Worker.

What the client provides here:

| Endpoint | What it does |
| --- | --- |
| `GET /api/ok` | Health check (no auth) |
| `POST /api/people` | Runs posted people through the standard inbound transform pipeline (identifier extraction, person id assignment) and upserts `person` / `person_email` / `person_phone` / `person_address` |
| `POST /api/upsert/:table` | Direct upserts to allow-listed person-related tables (e.g. `person_segment` for event attendance / entitlements) |
| `GET /api/read/:name` | Named reads of site content, optionally gated by `person_segment` membership. The `person_id` comes from the caller (the delegate-style session) — the client never looks it up |

All writes require an API key (`Authorization: Bearer e9key_...`); every
modification is written to the database and then logged through the client's
batch logger (here: the Worker log stream; with an R2 bucket, batches would be
written to R2).

## The stages

These are the stages that were applied to this repository, in order. Follow
the same sequence to install the client on any existing site.

### Stage 1 — Add the client library

```bash
npm install @engine9/core @engine9/id @engine9/schemas
```

`package.json` depends on the published releases:

```json
"@engine9/core": "^1.4.3",
"@engine9/id": "^1.4.1",
"@engine9/schemas": "^1.8.1"
```

`@engine9/input-tools` is core's dependency (2.5.1). There is no `overrides`
block. Core 1.9.1 peers `@engine9/schemas` `^1.9.0`.

`package.json` `engine9.pluginPackages` is `["@engine9/schemas"]`.
That is the default when the key is omitted. Cloudflare has no filesystem,
so those plugins are compiled in at build time.

`npm run build` runs `e9core build-plugins`, which writes gitignored
`engine9.plugins.js` (one literal import per plugin). Astro bundles that
file: `astro.config.mjs` aliases `@engine9/core/plugins/site` to it.
`wrangler.jsonc` has the same alias, and its `build.command` runs
`e9core build-plugins` again on `wrangler deploy`. The package stub at
`@engine9/core/plugins/site` exports null; without the alias, login fails
because no plugin registry is configured.

The same Vite and wrangler alias lists also point `@engine9/input-tools`
at `@engine9/core/cloudflare/input-tools-shim`, and `knex`, `mysql2`,
`mysql2/promise`, and `better-sqlite3` at
`@engine9/core/cloudflare/unavailable-module`. `i18n-iso-countries`
resolves to its browser build (`index.js`).

To ship a new `@engine9/schemas` release, upgrade that package only and redeploy.
Leave the `@engine9/core` version as it is:

```bash
npm install @engine9/schemas@latest
npm run deploy
```

`npm run deploy` is `e9core build-plugins`, then `astro build`, then
`wrangler deploy`. The new schema plugins are in the Worker because
`build-plugins` reads the copy this project installed.

### Stage 2 — Install the engine9 schema into the existing database

Generate the DDL with the client (no server required):

```bash
npx e9core sqlite-ddl --schema @engine9/schemas/person > engine9-ddl.sql
```

That DDL (idempotent `create table if not exists`) is the middle section of
`migrations/0003_engine9.sql`, plus the `api_key` table. On a fresh site with
no data to migrate, this stage is just "put the generated DDL in a migration".

### Stage 3 — Migrate existing data into the engine9 tables

This site already had its own `person` table (`person_id`, `name`, `email`,
`address`). `0003_engine9.sql`:

1. renames it out of the way,
2. copies rows into engine9's `person` (ids preserved, so session
   `person_id`s and `ticket` foreign keys keep working), `person_email`, and
   `person_address`,
3. rebuilds `ticket` so its foreign key points at `person(id)`,
4. drops the old table.

Site queries that read the old shape were updated (`/vip` now joins
`person` + `person_email` + `person_address`). Identifier hashes
(`person_identifier`) are not backfilled by SQL; they are computed by the
transform pipeline the next time a person flows through `POST /api/people`.

### Stage 4 — Seed the plugin, API key, and segments

Also in `0003_engine9.sql`:

- a `plugin` row for this website (`86dfc4a8-318b-51e6-9f25-d9648f963609`,
  from `getPluginUUID('engine9.demo', 'festival-website')`) — everything
  written through the API is attributed to it;
- an `api_key` row. The demo key is
  `e9key_0ca7302713d70f5d130cf52cbf9167f0ea1a45ef` (only its SHA-256 is
  stored). **Rotate this for any non-demo deployment**:

  ```bash
  # prints the key once (stderr) and the INSERT statement (stdout)
  npx e9core create-api-key --print-sql --name my-website \
    --scopes people:write,tables:write,data:read > new-key.sql
  npx wrangler d1 execute festival-db --remote --file new-key.sql
  # deactivate the demo key
  npx wrangler d1 execute festival-db --remote \
    --command "UPDATE api_key SET active = 0 WHERE name = 'festival-demo-website'"
  ```

- a `VIP` segment (`5f2ab45c-0a39-4939-a2af-c1fcc58f37ff`) plus
  `person_segment` rows for the existing VIP ticket holders;
- an `Admin` segment (`4f4ac886-f53d-48e1-b4bd-5a98eb48cc6f`, in
  `0004_admin_segment.sql`) with the seeded demo admin. Segments double as
  the site's **roles** for delegate logins (see Stage 8).

### Stage 5 — Wire the API into the site

Two small files:

- `src/lib/engine9.ts` — builds the client: `PersonWorker` on the `DB` D1
  binding with `createPluginRegistry` over `@engine9/core/plugins/site`,
  `SqlApiKeyStore` (swap for `KVApiKeyStore` + a KV namespace without
  touching endpoints), `BatchLogger`, and `createApi` with this site's plugin
  id, upsertable tables, and named reads (`vip-performances` gated by the VIP
  segment, `lineup` public). The first people write or login calls
  `installStandard()` so the published person schema plugins (the inbound
  pipeline) are installed. Core runs only plugins compiled into the build.
- `src/pages/api/[...path].ts` — Astro catch-all route that hands the raw
  `Request` to `api.handleFetch`. On a plain Worker (no Astro) you'd call
  `handleFetch` from `fetch()` directly — see
  `@engine9/core/cloudflare/worker.js`.

### Stage 6 — Verify locally

```bash
npm run db:reset            # apply all migrations to local D1
npm run preview             # build + wrangler dev
```

```bash
KEY=e9key_0ca7302713d70f5d130cf52cbf9167f0ea1a45ef
curl localhost:8787/api/ok
# create a person through the transform pipeline
curl -X POST localhost:8787/api/people -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"people":[{"email":"new@example.com","email_type":"Personal","given_name":"New","family_name":"Person"}]}'
# gated read: denied until the person joins the segment
curl "localhost:8787/api/read/vip-performances?person_id=901" -H "Authorization: Bearer $KEY"
# grant VIP via a person_segment upsert, then the read succeeds
curl -X POST localhost:8787/api/upsert/person_segment -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"rows":[{"person_id":901,"segment_id":"5f2ab45c-0a39-4939-a2af-c1fcc58f37ff"}]}'
curl "localhost:8787/api/read/vip-performances?person_id=901" -H "Authorization: Bearer $KEY"
```

### Stage 7 — Deploy

```bash
npm run db:migrate:remote   # apply migrations to the production D1 database
npm run deploy              # e9core build-plugins && astro build && wrangler deploy
```

For production, also rotate the API key (Stage 4) and, if long-term
modification logs are wanted, add an R2 bucket binding and switch the logger
in `src/lib/engine9.ts` to the R2 sink.

### Stage 8 — Delegate authentication

Login is provided by the shared **delegate** deployment via
`@engine9/core/auth/delegate` (`createDelegateAuth`). This site only wires
config and endpoints:

- `src/lib/roles.ts` — VIP (`minLevel: 1`) and Admin (`minLevel: 3`)
- `src/lib/engine9.ts` — `delegateAuth()` config (delegate URL, session
  secret, plugin id, role registry)
- `src/layouts/Layout.astro` — the `@engine9/id` login widget in the
  header, the main way visitors log in, switch email, pick a role, and log
  out (see Stage 9)
- `GET /auth/delegate` — callback: Identity Token (`?delegate_token=`)
- `POST /auth/delegate` — the same login for the widget (JSON)
- `POST /auth/role` + `/choose-role` — demo-only first-login role picker
- `src/middleware.ts` — gates `/vip` and `/admin` from the session

See [`@engine9/core` README — Delegate
authentication](../core/README.md#authentication) and
[`docs/identity-flow.md`](docs/identity-flow.md).

`SESSION_SECRET` is required. `DELEGATE_URL` is a wrangler var
(`https://delegate.engine9.ai`).

### Stage 9 — Identity Tokens and `@engine9/id`

Visitors use the `@engine9/id` login widget (`@engine9/id/widget`) in the
header. The layout renders the server session (`widgetUser(session)` in
`src/lib/session.ts`) into the widget as `user`. The widget's hooks call this
site's routes:

- `onLogin(identity, token)` — `POST /auth/delegate` with `{ delegate_token }`;
  answers `{ user, needsRole }`
- `onRoleChange(roleId)` — `POST /auth/role` with `Accept: application/json`;
  answers `{ redirect }`
- `onLogout()` — `POST /auth/logout` (`keepalive`), started in the same click
  as the Delegate logout popup

Underneath, every login is `GET /identity/authorize` or the
`/identity/bridge` popup (JWT, public JWKS). `/login` keeps the redirect
flow and a popup (`requestIdentity`) that lands on the `GET /auth/delegate`
callback. Registration uses the seeded `e9publickey_` (scope `public`) on
`POST /people`.

`auth.identityUrl({ returnTo, minLevel, fields: ["display_name", "email"], responseMode: "query" })`
builds the authorize URL. Those two fields are required. The login sends
no optional fields. The widget's **Switch email** and `GET /auth/change`
send the same request with `prompt: "select"` ("Change your Delegate
information"), so a signed-in person can pick another email address. See
[`docs/identity-flow.md`](docs/identity-flow.md).

## What stays on the engine9 server

The client is deliberately minimal: schema install, API keys, single-person
creation, person-related upserts, and segment-gated reads. Bulk file
ingestion, person export, FileWorker, scheduled jobs, and every other worker
remain in the engine9 server, which consumes this same client as an npm
library for the shared SQL/schema code.
