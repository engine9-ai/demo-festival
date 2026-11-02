import {
  sessionHasRole,
  sessionPrimaryRole,
  type DelegateSession,
  type CredentialLevel,
} from "@engine9/core/auth/delegate";
import { sessionFromRequest } from "@engine9/core/auth/gate";
import { meetsRequiredAuth } from "@engine9/core/auth/policy";
import { delegateAuth } from "./engine9";
import {
  ADMIN_SEGMENT_ID,
  VIP_SEGMENT_ID,
  ROLE_REGISTRY,
  ROLE_ORDER,
} from "./roles";

/**
 * Reading the Core Session. There is no session code of this site's own:
 * core signs people in (`/api/auth/start` and `/api/auth/callback` for a
 * redirect, `/api/auth/begin` and `/api/auth/login` with `cookie: true` for
 * the Login widget), sets the HttpOnly `e9_session` cookie, and verifies it
 * here. The middleware decides access with `requireRole`, which reads roles
 * from `person_segment` on each request.
 *
 * The helpers below read the roles copied into the session. They are for
 * display only (which nav links to show, the widget's role badge), never for
 * an access decision. Session.roles holds segment UUIDs (role_ids); display
 * labels come from ROLE_REGISTRY.
 */

/** Session payload minted by core. */
export type Session = DelegateSession;
export type { CredentialLevel };

/** The verified Core Session in this request's `e9_session` cookie, or null. */
export function getSession(request: Request): Promise<Session | null> {
  return sessionFromRequest({ auth: delegateAuth(), request }) as Promise<Session | null>;
}

/** Prefer the Identity Token `level`; infer from auth when an older session has none. */
export function inferredLevel(session: Session): number | undefined {
  if (typeof session.level === "number") return session.level;
  const auth = session.auth;
  if (!auth) return undefined;
  if (auth.twoFactor) return 4;
  if (auth.signInProvider === "google.com") return 3;
  if (session.email) return 2;
  return 1;
}

function credentialLevel(session: Session | null) {
  if (!session) return {};
  return { ...(session.auth || {}), level: inferredLevel(session) };
}

function roleAuthOk(session: Session | null, roleId: string): boolean {
  const role = ROLE_REGISTRY[roleId as keyof typeof ROLE_REGISTRY];
  if (!role) return false;
  return meetsRequiredAuth(role.requiredAuth, credentialLevel(session));
}

/** Display: show VIP links. Admins see them too, so they can preview VIP pages. */
export const showVip = (session: Session | null): boolean => {
  if (sessionHasRole(session, ADMIN_SEGMENT_ID) && roleAuthOk(session, ADMIN_SEGMENT_ID)) {
    return true;
  }
  return sessionHasRole(session, VIP_SEGMENT_ID) && roleAuthOk(session, VIP_SEGMENT_ID);
};

/** Display: show Admin links. */
export const showAdmin = (session: Session | null): boolean =>
  sessionHasRole(session, ADMIN_SEGMENT_ID) && roleAuthOk(session, ADMIN_SEGMENT_ID);

/** Demo self-serve roles: may this sign-in pick `roleId` (its Identity Level is enough)? */
export const canClaimRole = (session: Session | null, roleId: string): boolean =>
  Boolean(session) && roleAuthOk(session, roleId);

/** Signed in, but holding neither role yet: the demo offers /choose-role. */
export const holdsNoRole = (session: Session | null): boolean =>
  Boolean(session) && !sessionHasRole(session, ADMIN_SEGMENT_ID) && !sessionHasRole(session, VIP_SEGMENT_ID);

/**
 * What the header's Delegate login widget shows: the session's email, its
 * role key (`vip` | `admin`, or null before one is picked), and its Level.
 */
export function widgetUser(session: Session | null) {
  if (!session) return null;
  const role = primaryRole(session);
  return {
    email: session.email ?? null,
    role: role === "member" ? null : role,
    level: inferredLevel(session),
    twoFactor: Boolean(session.auth?.twoFactor),
  };
}

/**
 * CSS/badge label for the highest role (admin | vip | member).
 * Session stores UUIDs; this maps back to a stable lowercase display key.
 */
export const primaryRole = (session: Session | null): string => {
  const roleId = sessionPrimaryRole(session, [...ROLE_ORDER]);
  if (!roleId) return "member";
  const name = ROLE_REGISTRY[roleId as keyof typeof ROLE_REGISTRY]?.name;
  return name ? name.toLowerCase() : "member";
};
