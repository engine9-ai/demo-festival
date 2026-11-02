/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    session: import("./lib/session").Session | null;
    /**
     * Set by the middleware when `requireRole` answers 403, for `/denied`:
     * the gate's own result, so the page only renders it.
     */
    denied?: {
      reason: "role_not_held" | "auth_not_met" | "sign_in_required";
      role: string;
      email: string | null;
      changeUrl: string;
    };
    /** Set by @astrojs/cloudflare on each request (see createLocals). */
    cfContext?: ExecutionContext;
  }
}
