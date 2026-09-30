import type { APIRoute } from "astro";
import { loginIdentityUrl } from "../../lib/engine9";

/**
 * "Change your Delegate information". Repeats the login request with
 * `prompt=select`, so delegate shows its share page even when the Grant
 * already covers it. The person can pick another email address, add one, or
 * use a different Google account. Delegate returns a new Identity Token to
 * `/auth/delegate`, which replaces this site's session.
 */
export const GET: APIRoute = ({ url, redirect }) =>
  redirect(loginIdentityUrl(url.origin, { prompt: "select" }), 302);
