import type { APIRoute } from "astro";
import {
  createDelegateLoginFailure,
  domainFromUrl,
  normalizeDelegateLoginFailure,
} from "@engine9/core/auth/delegate";
import type { DelegateLoginFailure } from "@engine9/core/auth/delegate";
import { delegateAuth, ensureStandardPlugins } from "../../lib/engine9";
import { setSession, needsRole, isAdmin, widgetUser, type Session } from "../../lib/session";

/** `error=` codes Delegate's /identity/authorize sends back instead of a token. */
const DELEGATE_AUTHORIZE_ERRORS: Record<string, { kind: "auth" | "configuration"; message: string }> = {
  login_required: {
    kind: "auth",
    message: "Delegate sent you back without signing you in. Sign in on Delegate when it asks, then try again.",
  },
  interaction_required: {
    kind: "auth",
    message: "Delegate needs you to sign in or choose what to share before it can log you in here. Try Log in again.",
  },
  level_unavailable: {
    kind: "auth",
    message: "You did not share the details this site needs (display name and email), so Delegate could not log you in.",
  },
  access_denied: { kind: "auth", message: "You declined the login on Delegate." },
  invalid_domain: {
    kind: "configuration",
    message: "Delegate does not accept this site's domain. The site operator must allow it on Delegate.",
  },
  invalid_request: {
    kind: "configuration",
    message: "Delegate rejected this site's login request (return_to, fields, or levels).",
  },
};

function loginFailureRedirect(failure: DelegateLoginFailure) {
  const params = new URLSearchParams();
  if (failure.reason) params.set("error", failure.reason);
  if (failure.userMessage) params.set("message", failure.userMessage);
  if (failure.kind) params.set("kind", failure.kind);
  if (failure.message && failure.message !== failure.userMessage) {
    params.set("detail", failure.message);
  }
  return `/login?${params}`;
}

/**
 * Identity Token callback. Lands here from `/identity/authorize` with
 * `?delegate_token=` (`response_mode=query`).
 *
 * Core verifies the JWT, runs person dedupe, and returns a signed session.
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const identityToken = url.searchParams.get("delegate_token");
  const delegateError = url.searchParams.get("error");
  const returnTo = new URL("/auth/delegate", url.origin).toString();

  if (!identityToken && delegateError) {
    const known = DELEGATE_AUTHORIZE_ERRORS[delegateError];
    console.error("delegate returned an error instead of an Identity Token", {
      error: delegateError,
      state: url.searchParams.has("state"),
    });
    const params = new URLSearchParams({
      error: delegateError,
      message: known?.message ?? `Delegate sent you back with error ${delegateError} instead of signing you in.`,
      kind: known?.kind ?? "auth",
      detail: `Delegate /identity/authorize returned error=${delegateError}`,
    });
    return redirect(`/login?${params}`, 303);
  }

  let session: Session;
  try {
    if (!identityToken) {
      throw createDelegateLoginFailure("invalid_identity_token", {
        detail: `The callback had neither delegate_token nor error (query keys: ${[...url.searchParams.keys()].join(", ") || "none"})`,
      });
    }
    await ensureStandardPlugins();
    ({ session } = await delegateAuth().login(identityToken, {
      returnTo,
      domain: domainFromUrl(url.origin),
    }));
  } catch (e) {
    const failure = normalizeDelegateLoginFailure(e);
    console.error(
      "delegate login failed",
      { reason: failure.reason, kind: failure.kind, detail: failure.message },
      e,
    );
    return redirect(loginFailureRedirect(failure), 303);
  }

  setSession(cookies, session);

  // New delegate users have no role segments yet -> pick one (demo policy).
  if (needsRole(session)) return redirect("/choose-role", 303);
  return redirect(isAdmin(session) ? "/admin" : "/vip", 303);
};

/**
 * The same login for the header's Delegate login widget, which already has
 * the Identity Token from its popup: `{ delegate_token }` in, the session's
 * widget user out. The role is picked next, in the same dialog.
 */
export const POST: APIRoute = async ({ request, url, cookies }) => {
  const body = (await request.json().catch(() => null)) as { delegate_token?: unknown } | null;
  const identityToken = typeof body?.delegate_token === "string" ? body.delegate_token : "";
  let session: Session;
  try {
    if (!identityToken) {
      throw createDelegateLoginFailure("invalid_identity_token", {
        detail: "POST /auth/delegate needs a JSON body with delegate_token",
      });
    }
    await ensureStandardPlugins();
    ({ session } = await delegateAuth().login(identityToken, {
      returnTo: new URL("/auth/delegate", url.origin).toString(),
      domain: domainFromUrl(url.origin) ?? undefined,
    }));
  } catch (e) {
    const failure = normalizeDelegateLoginFailure(e);
    console.error(
      "delegate login failed",
      { reason: failure.reason, kind: failure.kind, detail: failure.message },
      e,
    );
    return Response.json(
      {
        error: failure.reason,
        kind: failure.kind,
        message: failure.userMessage || failure.message,
        detail: failure.message,
      },
      { status: failure.kind === "configuration" ? 500 : 400 },
    );
  }
  setSession(cookies, session);
  return Response.json({ user: widgetUser(session), needsRole: needsRole(session) });
};
