import type { APIRoute } from "astro";
import { sessionCookie } from "@engine9/core/auth/signIn";
import { ADMIN_SEGMENT_ID, VIP_SEGMENT_ID, delegateAuth } from "../../lib/engine9";
import { canClaimRole, getSession } from "../../lib/session";

/**
 * DEMO ONLY: pick your own role. This is the one piece of this site that is
 * not the recommended way, and it is here on purpose so a visitor can try
 * both roles. On a real site an operator grants roles
 * (`npx e9core segment add --segment admin --email …`), and nobody can make
 * themselves Admin. Do not copy this route.
 *
 * Everything around it is core's: the session is the `e9_session` cookie
 * core set at sign-in, `changeRole` writes `person_segment`, and the
 * re-signed session goes back into the same cookie. The Identity Level each
 * role needs (VIP 1, Admin 3) is still enforced, here and by the gate.
 */
export const POST: APIRoute = async ({ request, url, redirect }) => {
  // The header's Delegate login widget asks for JSON instead of redirects.
  const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
  const refuse = (status: number, error: string, message: string, to: string) =>
    wantsJson ? Response.json({ error, message }, { status }) : redirect(to, 303);

  const session = await getSession(request);
  if (!session) return refuse(401, "login_required", "Log in first.", "/login");

  const form = await request.formData();
  const role = form.get("role");
  const roleId =
    role === "admin" ? ADMIN_SEGMENT_ID : role === "vip" ? VIP_SEGMENT_ID : null;
  if (!roleId) {
    return wantsJson
      ? Response.json({ error: "unknown_role", message: "Unknown role" }, { status: 400 })
      : new Response("Unknown role", { status: 400 });
  }
  if (!canClaimRole(session, roleId)) {
    return refuse(
      403,
      "level",
      "That role needs a higher Identity Level. VIP needs Level 1; Admin needs Level 3 (trusted provider).",
      "/choose-role?error=level",
    );
  }

  const { token } = await delegateAuth().changeRole({
    personId: session.personId,
    roleId,
    exclusive: true,
    session,
  });
  const cookie = sessionCookie(token, { secure: url.protocol === "https:" });

  const to = roleId === ADMIN_SEGMENT_ID ? "/admin" : "/vip";
  const response = wantsJson ? Response.json({ redirect: to }) : redirect(to, 303);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
};
