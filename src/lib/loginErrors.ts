/**
 * What `?login_error=<reason>` means. core's `/api/auth/callback` sends a
 * failed sign-in back to its `returnTo` with the reason: Delegate's own
 * `error=` code, or core's reason when the token was refused.
 * `kind: "configuration"` is this site's setup, not the visitor.
 */
export const LOGIN_ERRORS: Record<string, { kind: "auth" | "configuration"; message: string }> = {
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
  invalid_identity_token: {
    kind: "auth",
    message: "Your sign-in token was not accepted (invalid or expired). Log in again.",
  },
  invalid_domain: {
    kind: "configuration",
    message: "Delegate does not accept this site's domain. The site operator must allow it on Delegate.",
  },
  invalid_request: {
    kind: "configuration",
    message: "Delegate rejected this site's login request (return_to, fields, or levels).",
  },
  plugin_registry_missing: {
    kind: "configuration",
    message: "This site was deployed without its schema plugins compiled in (e9core build-plugins).",
  },
  schema_update_failed: {
    kind: "configuration",
    message: "This site could not update its database schema during sign-in. The site operator needs to run e9core upgrade.",
  },
  database_error: {
    kind: "configuration",
    message: "This site's database refused a statement during sign-in.",
  },
  missing_session_secret: {
    kind: "configuration",
    message: "SESSION_SECRET is not set on this site, so it cannot sign anyone in.",
  },
  person_resolution_failed: {
    kind: "configuration",
    message: "You signed in, but this site could not find or create your record. The site operator needs to check its database.",
  },
};

export function loginErrorFor(reason: string | null) {
  if (!reason) return null;
  return (
    LOGIN_ERRORS[reason] ?? {
      kind: "auth" as const,
      message: `The login did not finish (${reason}). Try Log in again.`,
    }
  );
}
