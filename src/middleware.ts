import { defineMiddleware } from "astro:middleware";
import { requireRole } from "@engine9/core/auth/gate";
import { meetsRequiredAuth } from "@engine9/core/auth/policy";
import { changeSignInUrl, isPageRequest } from "@engine9/core/auth/signIn";
import { delegateAuth, LEVEL_GATES } from "./lib/engine9";
import { getSession, type Session } from "./lib/session";
import { logDbPath } from "./lib/db";

let dbPathLogged = false;

/** Gated paths and the roles that open them. Holding any one is enough. */
const GATES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["Admin"] },
  // Admins can preview VIP pages.
  { prefix: "/vip", roles: ["VIP", "Admin"] },
];

/**
 * Server-side gate. Runs on every request, before any page renders, so
 * content under /vip and /admin never reaches a browser without access.
 *
 * This is core's `requireRole`, unchanged. It reads the role from
 * `person_segment` on each request (removing someone takes effect at once)
 * and enforces the role's `requiredAuth` (Admin needs Level 3).
 *
 *   - Signed out: core's answer, a 302 to `/api/auth/start?returnTo=<this page>`.
 *   - Signed in without the role: a 403. Never a redirect to sign in:
 *     Delegate would return the same address, and the person would go round
 *     with nothing on screen. `/denied` renders the gate's own result: who
 *     they are signed in as, and its `changeUrl` to pick another address or
 *     account (`prompt=select&reason=access_denied`).
 *
 * `LEVEL_GATES` (`/level-2`) need no role, only an Identity Level. The
 * sign-in check is still `requireRole` (with no role); the Level is core's
 * `meetsRequiredAuth` on the verified session, the same test `requireRole`
 * applies to a role's `requiredAuth`.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!dbPathLogged) {
    dbPathLogged = true;
    try {
      await logDbPath();
    } catch {
      // PRAGMA may be blocked in D1; binding + local path hints are still logged.
    }
  }

  const path = context.url.pathname;
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

  const levelGate = LEVEL_GATES.find((g) => under(g.prefix));
  if (levelGate) {
    // No role: requireRole only checks the sign-in (signed out gets core's answer).
    const result = await requireRole({ auth: delegateAuth(), request: context.request });
    if (!result.ok) return result.response;
    const session = result.session as Session;
    const credential = { level: session.level, twoFactor: Boolean(session.auth?.twoFactor) };
    context.locals.session = session;
    if (meetsRequiredAuth(levelGate.requiredAuth, credential)) return next();
    // Signed in below the Level: a 403, never a redirect to sign in (it would loop).
    if (!isPageRequest(context.request)) {
      return Response.json(
        { error: "not allowed", reason: "auth_not_met", requiredLevel: levelGate.requiredAuth.minLevel, level: session.level ?? null },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const here = `${context.url.pathname}${context.url.search}`;
    context.locals.denied = {
      reason: "auth_not_met",
      role: `Level ${levelGate.requiredAuth.minLevel}`,
      email: session.email ?? null,
      changeUrl: changeSignInUrl(here, { reason: "access_denied" }),
      requiredLevel: levelGate.requiredAuth.minLevel,
      level: typeof session.level === "number" ? session.level : null,
    };
    const page = await next("/denied");
    return new Response(page.body, { status: 403, headers: page.headers });
  }

  const gate = GATES.find((g) => under(g.prefix));
  if (!gate) {
    context.locals.session = await getSession(context.request);
    return next();
  }

  const result = await requireRole({ auth: delegateAuth(), request: context.request, role: gate.roles });
  if (result.ok) {
    // The session with the roles held now, not the copy in the cookie.
    context.locals.session = result.session as Session;
    return next();
  }
  // Signed out, or fetch() from page code: core's answer as is (302, or JSON with the links).
  if (result.status !== 403 || !isPageRequest(context.request)) return result.response;

  // Signed in without access. The page shows roles held now, not the cookie's copy.
  const auth = delegateAuth();
  const session = await getSession(context.request);
  context.locals.session = session && { ...session, roles: await auth.rolesForSession(session) };
  context.locals.denied = {
    reason: result.reason,
    role: result.role ?? gate.roles.join(" or "),
    email: result.email ?? null,
    changeUrl: result.changeUrl,
  };
  const page = await next("/denied");
  return new Response(page.body, { status: 403, headers: page.headers });
});
