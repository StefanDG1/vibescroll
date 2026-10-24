import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import {
  signSandboxRequest,
  verifySandboxRequest,
} from "../packages/policy/sandbox-broker";
const secret = "01".repeat(32);
const request = (at = Date.now(), nonce = "ab".repeat(16)) =>
  JSON.stringify({ purpose: "vibescroller-sandbox-credentials", at, nonce });
afterEach(() => vi.unstubAllEnvs());
it("rejects expired, future, tampered, malformed and wrong-purpose machine requests", async () => {
  const now = Date.now(),
    body = request(now),
    signature = await signSandboxRequest(body, secret);
  expect(
    await verifySandboxRequest(body, signature, secret, now),
  ).toMatchObject({ nonce: "ab".repeat(16) });
  expect(
    await verifySandboxRequest(body, signature, "02".repeat(32), now),
  ).toBeNull();
  expect(
    await verifySandboxRequest(body + " ", signature, secret, now),
  ).toBeNull();
  for (const at of [now - 30001, now + 5001]) {
    const body = request(at);
    expect(
      await verifySandboxRequest(
        body,
        await signSandboxRequest(body, secret),
        secret,
        now,
      ),
    ).toBeNull();
  }
  const wrong = JSON.stringify({
    purpose: "other",
    at: now,
    nonce: "ab".repeat(16),
  });
  expect(
    await verifySandboxRequest(
      wrong,
      await signSandboxRequest(wrong, secret),
      secret,
      now,
    ),
  ).toBeNull();
  expect(await verifySandboxRequest(body, "0", secret, now)).toBeNull();
  expect(
    await verifySandboxRequest("x".repeat(257), signature, secret, now),
  ).toBeNull();
});
it("atomically refuses replayed authorization and disables issuance during recovery", async () => {
  const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
  vi.stubEnv("SANDBOX_BRIDGE_SECRET", secret);
  vi.stubEnv("SANDBOX_BRIDGE_ENABLED", "true");
  const body = request(),
    signature = await signSandboxRequest(body, secret);
  const result = await Promise.all([
    t.mutation(api.sandboxBroker.consume, { body, signature }),
    t.mutation(api.sandboxBroker.consume, { body, signature }),
  ]);
  expect(result.filter(Boolean)).toHaveLength(1);
  vi.stubEnv("RESTORE_LOCK", "true");
  const next = request(Date.now(), "ac".repeat(16));
  expect(
    await t.mutation(api.sandboxBroker.consume, {
      body: next,
      signature: await signSandboxRequest(next, secret),
    }),
  ).toBe(false);
  vi.stubEnv("RESTORE_LOCK", "false");
  vi.stubEnv("SANDBOX_BRIDGE_ENABLED", "false");
  expect(
    await t.mutation(api.sandboxBroker.consume, {
      body: next,
      signature: await signSandboxRequest(next, secret),
    }),
  ).toBe(false);
});
it("returns only current project-scoped source provenance from the existing bounded broker read", async () => {
  const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
  vi.stubEnv("SANDBOX_BRIDGE_SECRET", secret);
  vi.stubEnv("SANDBOX_BRIDGE_ENABLED", "true");
  vi.stubEnv("VERCEL_SANDBOX_PROJECT_ID", "prj_synthetic");
  vi.stubEnv("VERCEL_SANDBOX_TEAM_ID", "team_synthetic");
  const authority = {
    kind: "media" as const,
    snapshotId: "snap_syntheticCurrent123",
    expiresAt: Date.now() + 86400000,
    updatedAt: Date.now(),
    projectId: "prj_synthetic",
    teamId: "team_synthetic",
  };
  const id = await t.run((ctx) =>
    ctx.db.insert("sandboxToolSnapshots", {
      ...authority,
      lease: "private-maintenance-lease",
      leaseUntil: Date.now() + 1000,
    }),
  );
  const body = request(),
    signature = await signSandboxRequest(body, secret);
  expect(
    await t.mutation(api.sandboxBroker.consume, { body, signature }),
  ).toEqual({
    snapshots: {
      media: {
        snapshotId: authority.snapshotId,
        expiresAt: authority.expiresAt,
      },
    },
    snapshotAuthorities: { media: { ...authority, parentSnapshotId: null } },
  });
  await t.run((ctx) => ctx.db.patch(id, { projectId: "prj_foreign" }));
  const next = request(Date.now(), "af".repeat(16));
  expect(
    await t.mutation(api.sandboxBroker.consume, {
      body: next,
      signature: await signSandboxRequest(next, secret),
    }),
  ).toBe(false);
});
