import type { APIRoute } from "astro";
import { createEngine9Api, ensureSitePlugins } from "../../lib/engine9";

/**
 * Engine9 client API, served under /api by the same Worker as the site:
 *
 *   GET  /api/ok
 *   POST /api/people                 (Authorization: Bearer e9key_...)
 *   POST /api/upsert/:table
 *   GET  /api/read/vip-performances?person_id=...
 */
const handler: APIRoute = async ({ request, locals }) => {
  await ensureSitePlugins();
  const api = createEngine9Api();
  return api.handleFetch(request, { basePath: "/api", ctx: locals.cfContext });
};

export const GET = handler;
export const POST = handler;
export const ALL = handler;
