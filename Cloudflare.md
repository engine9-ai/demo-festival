# Deploying to Cloudflare Workers + D1

This file is **this festival site**. For a new website, follow
[`core/docs/deploy.md`](../core/docs/deploy.md) (Cloudflare and D1 section).
Browser-only identity, no D1: [`id/docs/deploy.md`](../id/docs/deploy.md).

This site is an Astro app served entirely by a single Cloudflare Worker, with
a D1 database (Cloudflare's hosted SQLite) as the primary data store. The
same code and the same SQL run locally and in production — locally the
database is a SQLite file under `.wrangler/state/`, deployed it is D1.

## Prerequisites

- A Cloudflare account with Workers enabled
- Wrangler authenticated: `npx wrangler login`
- Dependencies installed: `npm install`

## 1. Create the D1 database

```bash
npx wrangler d1 create festival-db
```

The command prints a `database_id` (a UUID). Copy it into `wrangler.jsonc`,
replacing the placeholder:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "festival-db",
    "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID",  // <-- paste here
    "migrations_dir": "migrations"
  }
]
```

## 2. Apply migrations to the remote database

Migrations live in `migrations/` (`0001_schema.sql` creates the tables,
`0002_seed.sql` inserts the demo lineup, schedule, ticket types, and the two
demo people). Apply them to D1:

```bash
npm run db:migrate:remote
# equivalent to: npx wrangler d1 migrations apply festival-db --remote
```

Wrangler tracks which migrations have run, so this is safe to re-run; only
new migration files are applied. To add data changes later, add a new
numbered file (e.g. `migrations/0003_more_artists.sql`) and re-run.

## 3. Build and deploy

```bash
npm run deploy
# e9core build-plugins && astro build && wrangler deploy
```

`e9core build-plugins` writes `engine9.plugins.js` from the installed
`@engine9/interfaces` (every plugin in `engine9.pluginPackages`). Astro
aliases `@engine9/core/plugins/site` to that file, so the Worker bundle
contains the interfaces. Wrangler uploads that Worker (entry point
`@astrojs/cloudflare/entrypoints/server`) plus the static assets in
`dist/`, and binds the D1 database as `env.DB`.

A new interfaces version is an upgrade of that package, then the same
deploy. Leave `@engine9/core` on its current version:

```bash
npm install @engine9/interfaces@latest
npm run deploy
```

## 4. (Optional) Custom domain

Add a route to `wrangler.jsonc` (the zone must be in your Cloudflare
account), then redeploy:

```jsonc
"routes": [
  { "pattern": "festival.example.com", "custom_domain": true }
]
```

The sibling `delegate` service uses this exact pattern for
`delegate.engine9.ai`.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server (applies local migrations first) |
| `npm run preview` | Build, then serve the production Worker locally via `wrangler dev` |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate` | Apply migrations to the **local** SQLite file |
| `npm run db:migrate:remote` | Apply migrations to **remote** D1 |
| `npm run db:reset` | Wipe local state and re-migrate/re-seed |
| `npx wrangler d1 execute festival-db --remote --command "SELECT * FROM artist"` | Ad-hoc SQL against production D1 |
| `npx wrangler tail` | Stream production Worker logs |

## Production auth note

Authentication is already wired through the shared **delegate** service
(`delegate.engine9.ai`). The preferred path is an Identity Token (JWT)
from `GET /identity/authorize`, verified via JWKS in
`@engine9/core/auth/delegate`. Login requests required fields
`display_name` and `email`, and no optional fields.

Set `SESSION_SECRET` with `wrangler secret put SESSION_SECRET`. After first login this
demo still shows `/choose-role` (VIP needs Level 1, Admin Level 3); that
picker is demo policy, not a Delegate feature.

See [`docs/identity-flow.md`](docs/identity-flow.md).
