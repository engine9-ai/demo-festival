# Solstice Wave Festival — permission-levels demo

A small festival website demonstrating **server-side permission gating** on a
public site: anonymous visitors see the lineup, schedule, and ticket prices;
VIPs get a members-only lounge page; admins get a management interface. Built
with Astro, backed by SQLite, deployable to Cloudflare Workers + D1.

This repo is the **with-core** example, and the reference implementation
of the recommended way to sign people in with `@engine9/core` and Delegate
([Sign-in](#sign-in-the-recommended-way-to-use-core-and-delegate)).
Browser-only identity (no database)
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

Dependencies are the published npm releases: `@engine9/core` ^1.18.0,
`@engine9/id` ^1.15.0, and `@engine9/schemas` ^1.11.4. `@engine9/input-tools`
comes in with core.

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

### Sign-in: the recommended way to use core and Delegate

**This site is the reference implementation of signing people in with
`@engine9/core` and Delegate. Copy it.** It follows core's
[Sign-in on a site](../core/docs/sign-in.md) to the letter:

- **One session.** core's HttpOnly `e9_session` cookie, set by core however
  the person signed in. This site has no session code, no session cookie,
  and no sign-in route of its own.
- **Two ways to sign in, both core's.**
  - The [`@engine9/id` Login widget](../id/README.md#with-a-server-session)
    in the header of every page (`src/layouts/Layout.astro`), with
    `core: { session: "cookie" }` (`BROWSER_CORE` in `src/lib/engine9.ts`).
    Each sign-in starts with core's `POST /api/auth/begin`, so the Identity
    Token carries a nonce core issued to this browser; `id.core.login()`
    makes core check it and set the cookie. The token never touches a route
    of this site.
  - A plain link to core's `/api/auth/start` for browsers without
    JavaScript (`/login`). core's `/api/auth/callback` sets the same cookie.
- **One gate.** `src/middleware.ts` runs core's `requireRole` before any
  page under `/vip` or `/admin` renders. It reads roles from
  `person_segment` on every request, never from the cookie.
  - Signed out: core's 302 to `/api/auth/start?returnTo=<this page>`.
  - Signed in without the role: a 403 (`/denied`) that says who they are
    signed in as and links to the gate's `changeUrl` (pick another address
    or account). **Never a redirect to sign in**, which would loop.
  - `fetch()` from page code gets the gate's JSON instead.

| Route | Whose | Purpose |
| --- | --- | --- |
| `GET /api/auth/start?returnTo=…` | core | Redirect sign-in. What Delegate is asked for is `config.signIn` in `src/lib/engine9.ts` (Level 1, `display_name` and `email`, the festival brand) |
| `GET /api/auth/callback` | core | Checks state and nonce, sets `e9_session`, returns to `returnTo` (`?login_error=` on failure) |
| `POST /api/auth/begin` | core | The widget's sign-in, step 1: a state and nonce bound to this browser |
| `POST /api/auth/login` with `cookie: true` | core | The widget's sign-in, step 2: checks them and the page's Origin, sets `e9_session` |
| `POST /api/auth/logout` | core | `id.logout()` calls it: clears the cookie |
| `GET /api/auth/me` | core | "Signed in as" for page code |
| `GET /signed-in` | this site | Where a sign-in without a page to return to lands; sends the person to `/admin`, `/vip`, or `/choose-role` |
| `GET /login` | this site | The redirect fallback, `changeSignInUrl()`, `login_error` messages, and Delegate debugging tools |
| `/denied` | this site | The festival-styled 403, rendered from `requireRole`'s result |
| `GET /choose-role`, `POST /auth/role` | this site, **demo only** | Pick VIP or Admin yourself, so visitors can try both. A stand-in for an operator granting the role (`npx e9core segment add`). **Do not copy this part** |

Everything except the last row is what any site should do. For how Identity
Tokens, person resolution, roles-as-segments, and sessions work, see
[`@engine9/core` README — Delegate authentication](../core/README.md#authentication).

### Roles

| Role | Segment | Scopes | `requiredAuth` |
| --- | --- | --- | --- |
| VIP | `5f2ab45c-…` | `data:read` | `minLevel: 1` |
| Admin | `4f4ac886-…` | `admin` | `minLevel: 3` |

Identity flow: [`docs/identity-flow.md`](docs/identity-flow.md).

Local development: copy `.env.example` to `.env`. `SESSION_SECRET` is required.
Point `DELEGATE_URL` at `https://delegate.network`. The redirect callback is
core's `/api/auth/callback` (`response_mode=query`).

## How it's put together

```
migrations/            SQL schema + seed (person, ticket, artist, engine9 tables, segments)
src/middleware.ts      core's requireRole before /vip/* and /admin/*; the 403 page for the rest
src/lib/roles.ts       Segment UUIDs, public/private API keys, role minLevel
src/lib/engine9.ts     PersonWorker + delegateAuth() + createApi (config.signIn) + BROWSER_CORE
src/lib/session.ts     Reads core's e9_session; display-only role helpers
src/lib/db.ts          D1/SQLite access + row types
src/pages/             Public pages, /login, /choose-role, /vip, /admin, auth endpoints
src/layouts/           Shared layout, nav that reflects login state, festival styling
```

Every page is server-rendered (`output: "server"`); there is no client-side
gating anywhere. All per-person rows (`person`, `ticket`) are keyed by an
integer `person_id`.

## engine9 client

The D1 database is also an **engine9 database**: migration
`0003_engine9.sql` installs the standard engine9 tables (`person`,
`person_email`, `person_segment`, ...) and the site serves the
`@engine9/core` API under `/api` — API-key-authenticated people creation,
person-related upserts, and segment-gated content reads. See
[ENGINE9.md](./ENGINE9.md) for the deployment stages.

## Deploying

See [Cloudflare.md](./Cloudflare.md) for deploying to Cloudflare Workers with
a D1 database.

## License

[MIT](./LICENSE). Use, copy, modify, and distribute this code as-is.
