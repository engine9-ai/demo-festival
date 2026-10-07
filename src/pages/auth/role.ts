import type { APIRoute } from "astro";
import { ADMIN_SEGMENT_ID, VIP_SEGMENT_ID, delegateAuth } from "../../lib/engine9";
import { canClaimRole, getSession, setSession } from "../../lib/session";

/**
 * Role selection (demo policy). role_id is the segment UUID. Core's changeRole
 * upserts person_segment and re-signs the session cookie.
 *
 * With loadRolesOnLogin: false, every fresh login re-prompts here even if
 * segments still exist from a prior visit.
 *
 * Adding new delegate users to person_segment like this is a DEMO-only
 * behavior -- delegate itself knows nothing about roles or segments, and
 * production deployments would assign segments through their own processes.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  // The header's Delegate login widget asks for JSON instead of redirects.
  const wantsJson = request.headers.get("accept")?.includes("application/json") ?? false;
  const refuse = (status: number, error: string, message: string, to: string) =>
    wantsJson ? Response.json({ error, message }, { status }) : redirect(to, 303);

  const session = getSession(cookies);
  if (!session) return refuse(401, "login_required", "Log in first.", "/login?required=member");

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

  const { session: next } = await delegateAuth().changeRole({
    personId: session.personId,
    roleId,
    exclusive: true,
    session,
  });
  setSession(cookies, next);

  const to = roleId === ADMIN_SEGMENT_ID ? "/admin" : "/vip";
  return wantsJson ? Response.json({ redirect: to }) : redirect(to, 303);
};
