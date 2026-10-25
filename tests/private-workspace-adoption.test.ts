import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

function adoptionArgs(
  preview: FunctionReturnType<typeof api.organizations.previewPrivateAdoption>,
) {
  return {
    organizationId: preview.organizationId,
    expectedVersion: preview.expectedVersion,
    previewedAt: preview.previewedAt,
    acknowledgePrivateOnly: true as const,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ownerId = await t.mutation(internal.accounts.syncUser, {
    subject: "adoption-owner",
    email: "owner@example.test",
    name: "Owner",
  });
  const otherId = await t.mutation(internal.accounts.syncUser, {
    subject: "adoption-other",
    email: "other@example.test",
    name: "Other",
  });
  const owner = t.withIdentity({
    subject: "adoption-owner",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const other = t.withIdentity({
    subject: "adoption-other",
    auth_time: Math.floor(Date.now() / 1000),
  });
  const organizationId = await owner.mutation(api.organizations.create, {
    name: "Personal workspace",
  });
  const preview = await owner.query(api.organizations.previewPrivateAdoption, {
    organizationId,
  });
  return { t, ownerId, otherId, owner, other, organizationId, preview };
}

it("adopts the reviewed sole-owner workspace in place without changing its content, default or paid access", async () => {
  const { t, ownerId, owner, organizationId, preview } = await setup();
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId,
    key: "adoption-post",
    kind: "text",
    title: "Existing saved post",
    text: "Keep the original text and evidence.",
    rightsAttested: true,
  });
  const projectId = await owner.mutation(api.projects.save, {
    organizationId,
    name: "Existing project",
    description: "Keep the project context.",
  });
  const before = await t.run(async (ctx) => ({
    organization: await ctx.db.get(organizationId),
    source: await ctx.db.get(sourceId),
    project: await ctx.db.get(projectId),
    user: await ctx.db.get(ownerId),
    memberships: await ctx.db.query("memberships").collect(),
    wallets: await ctx.db.query("wallets").collect(),
    billing: await ctx.db.query("billing").collect(),
    grants: await ctx.db.query("assistantGrants").collect(),
  }));
  expect(preview).toMatchObject({
    eligible: true,
    reason: "eligible",
    organizationId,
    organizationName: "Personal workspace",
    preservesPosts: true,
    preservesProjects: true,
    teamInvitationsDisabled: true,
  });
  expect(preview.expiresAt - preview.previewedAt).toBe(300_000);
  expect(
    await owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).toEqual({ organizationId, status: "adopted" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(organizationId)).toEqual({
      ...before.organization,
      privateOwnerId: ownerId,
    });
    expect(await ctx.db.get(sourceId)).toEqual(before.source);
    expect(await ctx.db.get(projectId)).toEqual(before.project);
    expect(await ctx.db.get(ownerId)).toEqual(before.user);
    expect(await ctx.db.query("memberships").collect()).toEqual(
      before.memberships,
    );
    expect(await ctx.db.query("organizations").collect()).toHaveLength(1);
    expect(await ctx.db.query("sources").collect()).toHaveLength(1);
    expect(await ctx.db.query("projects").collect()).toHaveLength(1);
    expect(await ctx.db.query("wallets").collect()).toEqual(before.wallets);
    expect(await ctx.db.query("billing").collect()).toEqual(before.billing);
    expect(await ctx.db.query("assistantGrants").collect()).toEqual(
      before.grants,
    );
    expect(
      (await ctx.db.query("audit").collect()).filter(
        (row) => row.action === "organization.private_adopted",
      ),
    ).toHaveLength(1);
  });
  expect(
    (await owner.query(api.organizations.details, { organizationId })).private,
  ).toBe(true);
  expect(
    await owner.query(api.projects.get, { organizationId, id: projectId }),
  ).toEqual(before.project);
});

it("never treats a Personal workspace name or a read-only preview as private ownership", async () => {
  const { t, owner, organizationId } = await setup();
  await owner.query(api.organizations.previewPrivateAdoption, {
    organizationId,
  });
  expect(
    (await t.run((ctx) => ctx.db.get(organizationId)))?.privateOwnerId,
  ).toBeUndefined();
});

it("keeps sole-owner Cloud eligibility before and after optional adoption without processing the saved video", async () => {
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["adoption-owner"]');
  vi.stubEnv("WORK_CLOUD_MEDIA_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_MEDIA_VERIFIED", "true");
  vi.stubEnv("DISABLE_INFERENCE", "false");
  vi.stubEnv("DISABLE_PERSONAL_ANALYSIS", "false");
  const { t, owner, organizationId, preview } = await setup();
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId,
    key: "adoption-cloud-media",
    kind: "url",
    url: "https://www.instagram.com/reel/AdoptionFixture1/",
    title: "Synthetic permitted video",
    rightsAttested: true,
  });
  const original = await t.run((ctx) => ctx.db.get(sourceId));
  const before = await owner.query(api.product.detail, {
    organizationId,
    id: sourceId,
  });
  expect(before).toMatchObject({
    _id: sourceId,
    organizationId,
    workCloudPrivateLibraryRequired: false,
    workCloudMediaEnabled: true,
    workCloudHandoff: null,
  });
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", "[]");
  expect(
    await owner.query(api.product.detail, { organizationId, id: sourceId }),
  ).toMatchObject({
    workCloudPrivateLibraryRequired: false,
    workCloudMediaEnabled: false,
  });
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", '["adoption-owner"]');
  await owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview));
  const after = await owner.query(api.product.detail, {
    organizationId,
    id: sourceId,
  });
  expect(after).toMatchObject({
    _id: sourceId,
    organizationId,
    generation: before.generation,
    state: before.state,
    workCloudPrivateLibraryRequired: false,
    workCloudMediaEnabled: true,
    workCloudHandoff: null,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(sourceId)).toEqual(original);
    expect(original?.personalAnalysis).toBeUndefined();
    expect(await ctx.db.query("assistantGrants").collect()).toEqual([]);
    expect(await ctx.db.query("runs").collect()).toEqual([]);
    expect(await ctx.db.query("localLibraryRuns").collect()).toEqual([]);
  });
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", "[]");
  expect(
    await owner.query(api.product.detail, { organizationId, id: sourceId }),
  ).toMatchObject({
    workCloudPrivateLibraryRequired: false,
    workCloudMediaEnabled: false,
  });
});

it("denies anonymous and foreign access to preview and adoption", async () => {
  const { t, other, organizationId, preview } = await setup();
  for (const client of [t, other]) {
    await expect(
      client.query(api.organizations.previewPrivateAdoption, {
        organizationId,
      }),
    ).rejects.toThrow();
    await expect(
      client.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    ).rejects.toThrow();
  }
});

it.each(["admin", "member", "viewer"] as const)(
  "refuses a %s and keeps the preview free of other member details",
  async (role) => {
    const { t, otherId, other, organizationId, preview } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("memberships", { organizationId, userId: otherId, role }),
    );
    const denied = await other.query(api.organizations.previewPrivateAdoption, {
      organizationId,
    });
    expect(denied).toMatchObject({ eligible: false, reason: "owner_required" });
    expect(JSON.stringify(denied)).not.toContain("owner@example.test");
    await expect(
      other.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    ).rejects.toThrow("permission");
  },
);

it("refuses a transferred sole owner who did not create the workspace", async () => {
  const { t, ownerId, other, otherId, organizationId } = await setup();
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("memberships")
      .withIndex("by_pair", (q) =>
        q.eq("organizationId", organizationId).eq("userId", ownerId),
      )
      .unique();
    await ctx.db.delete(member!._id);
    await ctx.db.insert("memberships", {
      organizationId,
      userId: otherId,
      role: "owner",
    });
  });
  const preview = await other.query(api.organizations.previewPrivateAdoption, {
    organizationId,
  });
  expect(preview).toMatchObject({
    eligible: false,
    reason: "creator_required",
  });
  await expect(
    other.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("creator_required");
});

it.each(["owner", "member"] as const)(
  "rechecks a newly added %s after preview",
  async (role) => {
    const { t, owner, otherId, organizationId, preview } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("memberships", { organizationId, userId: otherId, role }),
    );
    expect(
      await owner.query(api.organizations.previewPrivateAdoption, {
        organizationId,
      }),
    ).toMatchObject({ eligible: false, reason: "shared_workspace" });
    await expect(
      owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    ).rejects.toThrow("shared_workspace");
    expect(
      (await t.run((ctx) => ctx.db.get(organizationId)))?.privateOwnerId,
    ).toBeUndefined();
  },
);

it("refuses pending invitations added after preview without disclosing their recipients", async () => {
  const { owner, organizationId, preview } = await setup();
  await owner.mutation(api.organizations.invite, {
    organizationId,
    email: "other@example.test",
    role: "viewer",
    tokenHash: "a".repeat(64),
  });
  const denied = await owner.query(api.organizations.previewPrivateAdoption, {
    organizationId,
  });
  expect(denied).toMatchObject({
    eligible: false,
    reason: "pending_invitations",
  });
  expect(JSON.stringify(denied)).not.toContain("other@example.test");
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("pending_invitations");
});

it("allows expired invitations while refusing saturated invitation reads", async () => {
  const { t, ownerId, owner, organizationId, preview } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 51; i++)
      await ctx.db.insert("invitations", {
        organizationId,
        email: `expired${i}@example.test`,
        role: "viewer",
        tokenHash: i.toString(16).padStart(64, "0"),
        createdBy: ownerId,
        expiresAt: Date.now() - 1,
      });
  });
  expect(
    await owner.query(api.organizations.previewPrivateAdoption, {
      organizationId,
    }),
  ).toMatchObject({ eligible: false, reason: "invitation_check_limit" });
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("invitation_check_limit");
  await t.run(async (ctx) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .first();
    await ctx.db.delete(invitation!._id);
  });
  expect(
    (
      await owner.query(api.organizations.previewPrivateAdoption, {
        organizationId,
      })
    ).eligible,
  ).toBe(true);
  expect(
    await owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).toMatchObject({ status: "adopted" });
});

it.each(["active", "deleting"] as const)(
  "refuses another %s private library created after preview",
  async (status) => {
    const { t, owner, organizationId, preview } = await setup();
    const otherPrivate = await owner.mutation(
      api.organizations.createPrivate,
      {},
    );
    await t.run((ctx) => ctx.db.patch(otherPrivate, { status }));
    expect(
      await owner.query(api.organizations.previewPrivateAdoption, {
        organizationId,
      }),
    ).toMatchObject({ eligible: false, reason: "other_private_workspace" });
    await expect(
      owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    ).rejects.toThrow("other_private_workspace");
  },
);

it("rejects stale organization and replaced membership identities", async () => {
  const { t, owner, ownerId, organizationId, preview } = await setup();
  await owner.mutation(api.organizations.rename, {
    organizationId,
    name: "Changed since review",
  });
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("preview changed");
  const renamedPreview = await owner.query(
    api.organizations.previewPrivateAdoption,
    { organizationId },
  );
  await t.run(async (ctx) => {
    await ctx.db.delete(renamedPreview.membershipId);
    await ctx.db.insert("memberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
  });
  await expect(
    owner.mutation(
      api.organizations.adoptPrivate,
      adoptionArgs(renamedPreview),
    ),
  ).rejects.toThrow("preview changed");
});

it.each(["expired", "future", "fractional"] as const)(
  "rejects a %s preview time",
  async (kind) => {
    const { owner, preview } = await setup();
    const previewedAt =
      kind === "expired"
        ? Date.now() - 300_000
        : kind === "future"
          ? Date.now() + 60_000
          : Date.now() + 0.5;
    await expect(
      owner.mutation(api.organizations.adoptPrivate, {
        ...adoptionArgs(preview),
        previewedAt,
      }),
    ).rejects.toThrow("preview changed or expired");
  },
);

it.each([
  undefined,
  Math.floor(Date.now() / 1000) - 301,
  Math.floor(Date.now() / 1000) + 60,
])("requires recent authentication at mutation time: %s", async (auth_time) => {
  const { t, preview } = await setup();
  const staleOwner = t.withIdentity({
    subject: "adoption-owner",
    ...(auth_time === undefined ? {} : { auth_time }),
  });
  await expect(
    staleOwner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("Sign in again");
});

it("requires the explicit private-only acknowledgement", async () => {
  const { owner, preview } = await setup();
  await expect(
    owner.mutation(api.organizations.adoptPrivate, {
      ...adoptionArgs(preview),
      // Exercise the server validator rather than the generated client type.
      acknowledgePrivateOnly: false as true,
    }),
  ).rejects.toThrow();
});

it("keeps restore, deleting-account and deleting-workspace locks on adoption", async () => {
  const { t, owner, ownerId, organizationId, preview } = await setup();
  vi.stubEnv("RESTORE_LOCK", "true");
  await expect(
    owner.query(api.organizations.previewPrivateAdoption, { organizationId }),
  ).rejects.toThrow("Recovery");
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("Recovery");
  vi.stubEnv("RESTORE_LOCK", "false");
  await t.run((ctx) => ctx.db.patch(ownerId, { status: "deleting" }));
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("Account unavailable");
  await t.run(async (ctx) => {
    await ctx.db.patch(ownerId, { status: "active" });
    await ctx.db.patch(organizationId, { status: "deleting" });
  });
  await expect(
    owner.query(api.organizations.previewPrivateAdoption, { organizationId }),
  ).rejects.toThrow("unavailable");
  await expect(
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
  ).rejects.toThrow("unavailable");
});

it("handles concurrent adoption and current private retries without repeating the audit", async () => {
  const { t, owner, organizationId, preview } = await setup();
  const attempts = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    ),
  );
  expect(
    attempts.filter((attempt) => attempt.status === "fulfilled"),
  ).toHaveLength(1);
  const current = await owner.query(api.organizations.previewPrivateAdoption, {
    organizationId,
  });
  expect(current).toMatchObject({ eligible: false, reason: "already_private" });
  for (let i = 0; i < 2; i++)
    expect(
      await owner.mutation(
        api.organizations.adoptPrivate,
        adoptionArgs(current),
      ),
    ).toEqual({ organizationId, status: "already_private" });
  expect(
    await t.run(async (ctx) =>
      (await ctx.db.query("audit").collect()).filter(
        (row) => row.action === "organization.private_adopted",
      ),
    ),
  ).toHaveLength(1);
});

it("keeps invitations and accidental foreign memberships blocked after adoption", async () => {
  const { t, ownerId, otherId, owner, other, organizationId, preview } =
    await setup();
  await owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview));
  const tokenHash = "f".repeat(64);
  await expect(
    owner.mutation(api.organizations.invite, {
      organizationId,
      email: "other@example.test",
      role: "viewer",
      tokenHash,
    }),
  ).rejects.toThrow("private");
  await t.run((ctx) =>
    ctx.db.insert("invitations", {
      organizationId,
      email: "other@example.test",
      role: "viewer",
      tokenHash,
      createdBy: ownerId,
      expiresAt: Date.now() + 60_000,
    }),
  );
  await expect(
    other.mutation(api.organizations.acceptInvite, { tokenHash }),
  ).rejects.toThrow("unavailable");
  await t.run((ctx) =>
    ctx.db.insert("memberships", {
      organizationId,
      userId: otherId,
      role: "owner",
    }),
  );
  await expect(
    other.query(api.organizations.details, { organizationId }),
  ).rejects.toThrow("unavailable");
  await expect(
    other.query(api.organizations.previewPrivateAdoption, { organizationId }),
  ).rejects.toThrow("unavailable");
});

it("serializes a racing invitation against adoption so both cannot succeed", async () => {
  const { t, owner, organizationId, preview } = await setup();
  const [adoption, invitation] = await Promise.allSettled([
    owner.mutation(api.organizations.adoptPrivate, adoptionArgs(preview)),
    owner.mutation(api.organizations.invite, {
      organizationId,
      email: "other@example.test",
      role: "viewer",
      tokenHash: "b".repeat(64),
    }),
  ]);
  expect(
    [adoption, invitation].filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  await t.run(async (ctx) => {
    const workspace = await ctx.db.get(organizationId);
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();
    expect(Boolean(workspace?.privateOwnerId) && invitations.length > 0).toBe(
      false,
    );
  });
});
