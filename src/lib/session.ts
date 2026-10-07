import type { AstroCookies } from "astro";
import {
  sessionHasRole,
  sessionPrimaryRole,
  sessionNeedsRole,
  type DelegateSession,
  type CredentialLevel,
} from "@engine9/core/auth/delegate";
import { meetsRequiredAuth } from "@engine9/core/auth/policy";
import { delegateAuth } from "./engine9";
import {
  ADMIN_SEGMENT_ID,
  VIP_SEGMENT_ID,
  ROLE_REGISTRY,
  ROLE_ORDER,
} from "./roles";

/**
 * Thin cookie glue around @engine9/core's delegate auth. All real logic --
 * Identity Token verification, person dedupe (id_type "delegate"), role lookup from
 * person_segment, token signing/verification -- lives in core; this file only
 * moves the signed token in and out of the Astro cookie jar.
 *
 * Session.roles holds segment UUIDs (role_ids). Display labels come from
 * ROLE_REGISTRY.
 */

/** Session payload minted by core's createDelegateAuth().login(). */
export type Session = DelegateSession;
export type { CredentialLevel };

/** Astro/Lucia community convention; cookie glue stays here — core is host-agnostic. */
const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day

export function getSession(cookies: AstroCookies): Session | null {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return delegateAuth().verify(token);
}

export function setSession(cookies: AstroCookies, session: Session): void {
  cookies.set(COOKIE_NAME, delegateAuth().issueToken(session), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession(cookies: AstroCookies): void {
  cookies.delete(COOKIE_NAME, { path: "/" });
  // Drop the old demo-specific name if present.
  cookies.delete("festival_session", { path: "/" });
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

/** Can this session see VIP content? Admins can, so they can preview it. */
export const canAccessVip = (session: Session | null): boolean => {
  if (sessionHasRole(session, ADMIN_SEGMENT_ID) && roleAuthOk(session, ADMIN_SEGMENT_ID)) {
    return true;
  }
  return sessionHasRole(session, VIP_SEGMENT_ID) && roleAuthOk(session, VIP_SEGMENT_ID);
};

export const isAdmin = (session: Session | null): boolean =>
  sessionHasRole(session, ADMIN_SEGMENT_ID) && roleAuthOk(session, ADMIN_SEGMENT_ID);

export const canClaimRole = (session: Session | null, roleId: string): boolean =>
  Boolean(session) && roleAuthOk(session, roleId);

/** Logged in via delegate but hasn't picked (or been granted) a role yet. */
export const needsRole = (session: Session | null): boolean =>
  sessionNeedsRole(session);

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
