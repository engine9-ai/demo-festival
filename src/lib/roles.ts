/**
 * Role registry keyed by segment UUID (role_id === segment_id).
 * Display names are site policy only — not defined by core or Delegate.
 *
 * This is the **segment-role** form of the same `requiredAuth` shape used by
 * **declared roles** in `@engine9/id` (see id/docs/declared-roles.md and
 * demo-id). Soft declared roles personalize the browser; these entries enforce
 * scopes + minLevel on the server via core.
 */

/** getPluginUUID('engine9.demo', 'festival-website') -- seeded in 0003_engine9.sql */
export const FESTIVAL_PLUGIN_ID = "86dfc4a8-318b-51e6-9f25-d9648f963609";
/** The VIP segment seeded in 0003_engine9.sql; gates VIP content reads */
export const VIP_SEGMENT_ID = "5f2ab45c-0a39-4939-a2af-c1fcc58f37ff";
/** The Admin segment seeded in 0004_admin_segment.sql; grants /admin access */
export const ADMIN_SEGMENT_ID = "4f4ac886-f53d-48e1-b4bd-5a98eb48cc6f";
/** Private demo API key seeded in 0003_engine9.sql — server-side only */
export const DEMO_API_KEY = "e9key_0ca7302713d70f5d130cf52cbf9167f0ea1a45ef";
/** Public form key seeded in 0005_public_api_key.sql — scope `public` only */
export const DEMO_PUBLIC_API_KEY =
  "e9publickey_9f2c1a0b8d7e6f5a4c3b2d1e0f9a8b7c6d5e4f3a";

export const ROLE_REGISTRY: Record<
  string,
  { name: string; scopes: string[]; requiredAuth: { minLevel: number; twoFactor?: boolean } }
> = {
  [ADMIN_SEGMENT_ID]: {
    name: "Admin",
    scopes: ["admin"],
    requiredAuth: { minLevel: 3, twoFactor: false },
  },
  [VIP_SEGMENT_ID]: {
    name: "VIP",
    scopes: ["data:read"],
    requiredAuth: { minLevel: 1 },
  },
};

/**
 * Pages any signed-in person may open once their sign-in reaches an Identity
 * Level, whatever their role. `/level-2` needs Level 2: an email address the
 * person has proven they receive (the emailed code), or anything stronger.
 */
export const LEVEL_GATES: { prefix: string; requiredAuth: { minLevel: number } }[] = [
  { prefix: "/level-2", requiredAuth: { minLevel: 2 } },
];

/** Admin-first order for sessionPrimaryRole. */
export const ROLE_ORDER = [ADMIN_SEGMENT_ID, VIP_SEGMENT_ID] as const;

export type RoleId = typeof ADMIN_SEGMENT_ID | typeof VIP_SEGMENT_ID;
