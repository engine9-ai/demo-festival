import type { APIRoute } from "astro";
import { startLogin } from "../../lib/session";

/**
 * Redirect login (no JavaScript or popups). Sends the browser to Delegate with
 * a fresh `state`; Delegate returns to `/auth/delegate`. `?again=1` is the one
 * automatic retry `/auth/delegate` makes when a return's `state` is not this
 * browser's.
 */
export const GET: APIRoute = ({ url, cookies, redirect }) =>
  redirect(startLogin(cookies, url.origin, { again: url.searchParams.get("again") === "1" }), 302);
