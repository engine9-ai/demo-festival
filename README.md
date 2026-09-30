# Solstice Wave Festival — permission-levels demo

A small festival website demonstrating **server-side permission gating** on a
public site: anonymous visitors see the lineup, schedule, and ticket prices;
VIPs get a members-only lounge page; admins get a management interface. Built
with Astro, backed by SQLite, deployable to Cloudflare Workers + D1.

This repo is the **with-core** example. Browser-only identity (no database)
is [`demo-id`](../demo-id). First-time deploy writeups:
[id](../id/docs/deploy.md) and [core](../core/docs/deploy.md) (D1 steps in
the core guide). Festival-specific Cloudflare notes stay in
[`Cloudflare.md`](Cloudflare.md).

This repository is [MIT licensed](./LICENSE). Use, copy, modify, and
distribute this code as-is.

## Run it locally

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Dependencies are the published npm releases: `@engine9/core` ^1.4.3,
`@engine9/id` ^1.4.1, and `@engine9/interfaces` ^1.8.1. `@engine9/input-tools`
comes in with core (2.5.1).

Open **http://localhost:3000** (or **http://localhost:3001** /
**http://localhost:3002** if 3000 is taken). Set `PORT` in `.env` to pin a
port (e.g. `PORT=3001`); run `npx astro dev stop` before restarting if the port
changed. Ports 3000–3002 are the allowed `return_to` origins for local
development (see `ALLOWED_DOMAINS` on the delegate Worker).
The dev script first applies the SQL migrations in `migrations/` to a local
SQLite database (stored under `.wrangler/state/`), seeding the five acts, the
schedule, ticket types, and two demo people. `npm run db:reset` wipes it back
to the seed state.

## The demo

- **Public**: home, `/lineup`, `/schedule`, `/tickets`. The schedule query
  excludes VIP-only sets, so gated data never reaches logged-out visitors.
- **`/vip`**: VIP Lounge — the visitor's name, address, and ticket (all
  per-person data keyed by integer `person_id`), plus VIP-only sessions.
- **`/admin`**: add/remove artists, edit the schedule (including flagging
  sets VIP-only), and set ticket prices. Changes appear on the public site
  immediately.

### Auth endpoints

Login is provided by the shared **delegate** service via `@engine9/core`.
This site only wires config and HTTP endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /login` | Identity Token (`/identity/authorize`). Required fields `display_name`, `email`; no optional fields |
| `GET /auth/delegate` | Callback: Identity Token (`?delegate_token=`) |
| `GET /auth/change` | "Change your Delegate information": the login request with `prompt=select`, so the person can pick another email address |
| `POST /auth/role` | Demo-only: grants VIP or Admin after first login |
| `GET /choose-role` | First-time users pick VIP or Admin |
| `POST /auth/logout` (or site logout) | Clears the local session cookie |

`src/middleware.ts` reads the session on every request and redirects to
`/login` (or `/choose-role`) before any gated page renders.

For how Identity Tokens, person resolution, roles-as-segments, and signed
sessions work, see [`@engine9/core` README — Delegate
authentication](../core/README.md#authentication).

### Roles

| Role | Segment | Scopes | `requiredAuth` |
| --- | --- | --- | --- |
| VIP | `5f2ab45c-…` | `data:read` | `minLevel: 1` |
| Admin | `4f4ac886-…` | `admin` | `minLevel: 3` |

Identity flow: [`docs/identity-flow.md`](docs/identity-flow.md).

Local development: copy `.env.example` to `.env`. `SESSION_SECRET` is required.
Point `DELEGATE_URL` at `https://delegate.engine9.ai`. The callback is
`?delegate_token=` (`response_mode=query`).

## How it's put together

```
migrations/            SQL schema + seed (person, ticket, artist, engine9 tables, segments)
src/middleware.ts      Server-side gate for /vip/* and /admin/*
src/lib/roles.ts       Segment UUIDs, public/private API keys, role minLevel
src/lib/engine9.ts     PersonWorker + delegateAuth() + createApi wiring
src/lib/session.ts     Cookie glue around core's signed delegate session
src/lib/db.ts          D1/SQLite access + row types
src/pages/             Public pages, /login, /choose-role, /vip, /admin, auth endpoints
src/layouts/           Shared layout, nav that reflects login state, festival styling
```

Every page is server-rendered (`output: "server"`); there is no client-side
gating anywhere. All per-person rows (`person`, `ticket`) are keyed by an
integer `person_id`.

## engine9 client

The D1 database is also an **engine9 database**: migration
`0003_engine9.sql` installs the standard engine9 interface tables (`person`,
`person_email`, `person_segment`, ...) and the site serves the
`@engine9/core` API under `/api` — API-key-authenticated people creation,
person-related upserts, and segment-gated content reads. See
[ENGINE9.md](./ENGINE9.md) for the deployment stages.

## Deploying

See [Cloudflare.md](./Cloudflare.md) for deploying to Cloudflare Workers with
a D1 database.

## License

[MIT](./LICENSE). Use, copy, modify, and distribute this code as-is.
