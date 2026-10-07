import type { APIRoute } from "astro";
import { createEngine9Api, DEMO_PUBLIC_API_KEY, ensureStandardPlugins } from "../../lib/engine9";

const EMAIL_TYPES = new Set(["Personal", "Work", "Other"]);

/**
 * Registration handler. Forwards the form to POST /api/people server-side so
 * the API key never reaches the browser. Field names match
 * `@engine9/schemas` person + person_email.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const given_name = String(form.get("given_name") ?? "").trim();
  const family_name = String(form.get("family_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const email_type_raw = String(form.get("email_type") ?? "Personal").trim();
  const email_type = EMAIL_TYPES.has(email_type_raw) ? email_type_raw : "";

  if (!given_name) return redirect("/register?error=given_name", 303);
  if (!email || !email.includes("@")) return redirect("/register?error=email", 303);
  if (!email_type) return redirect("/register?error=email_type", 303);

  await ensureStandardPlugins();
  const api = createEngine9Api();
  const apiRequest = new Request("http://localhost/api/people", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEMO_PUBLIC_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      people: [{ given_name, family_name, email, email_type }],
    }),
  });

  const response = await api.handleFetch(apiRequest, { basePath: "/api" });
  const body = (await response.json()) as {
    personIds?: number[];
    error?: string;
  };

  if (!response.ok) {
    const message = encodeURIComponent(body.error || `status_${response.status}`);
    return redirect(`/register?error=${message}`, 303);
  }

  const personId = body.personIds?.[0];
  const suffix = personId ? `&person_id=${personId}` : "";
  return redirect(`/register?ok=1${suffix}`, 303);
};
