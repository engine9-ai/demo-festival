import { test } from "node:test";
import assert from "node:assert";
import {
  ROLE_REGISTRY,
  ADMIN_SEGMENT_ID,
  VIP_SEGMENT_ID,
  DEMO_PUBLIC_API_KEY,
  LEVEL_GATES,
} from "../src/lib/roles.ts";

test("demo roles declare Identity Level gates", () => {
  assert.equal(ROLE_REGISTRY[ADMIN_SEGMENT_ID].requiredAuth.minLevel, 3);
  assert.equal(ROLE_REGISTRY[VIP_SEGMENT_ID].requiredAuth.minLevel, 1);
  assert.deepEqual(ROLE_REGISTRY[ADMIN_SEGMENT_ID].scopes, ["admin"]);
  assert.deepEqual(ROLE_REGISTRY[VIP_SEGMENT_ID].scopes, ["data:read"]);
  assert.ok(DEMO_PUBLIC_API_KEY.startsWith("e9publickey_"));
});

test("/level-2 needs Level 2 and no role", () => {
  const gate = LEVEL_GATES.find((g) => g.prefix === "/level-2");
  assert.ok(gate);
  assert.deepEqual(gate.requiredAuth, { minLevel: 2 });
});
