import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const subject = "user_01234567890123456789012345";
const clientId = "client_01234567890123456789012345";
const issuer = "https://cloud-request-fixture.authkit.app";
const scopes = ["analysis:execute", "analysis:request", "jobs:read"];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup(policy = true, library = false, team = false) {
  for (const key of [
    "MCP_ENABLED",
    "WORK_CLOUD_MEDIA_ENABLED",
    "WORK_CLOUD_MEDIA_VERIFIED",
  ])
    vi.stubEnv(key, "true");
  vi.stubEnv("PERSONAL_ALPHA_SUBJECTS_JSON", JSON.stringify([subject]));
  vi.stubEnv("MCP_AUTH_ISSUER", issuer);
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([{ id: clientId, name: "Fixture", scopes }]),
  );
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const actorId = await t.mutation(internal.accounts.syncUser, {
    subject,
    email: "fixture@example.test",
    name: "Fixture",
  });
  const owner = t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000),
  });
  const identity = {
    subject,
    issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    sid: "app_consent_01234567890123456789012345",
  };
  const assistant = t.withIdentity(identity);
  const privateOrg = await owner.mutation(api.organizations.createPrivate, {});
  const org = team
    ? await owner.mutation(api.organizations.create, { name: "Original team" })
    : privateOrg;
  const sourceId = await owner.mutation(api.product.capture, {
    organizationId: org,
    kind: "url",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    title: "Synthetic permission fixture",
    key: "cloud-request-fixture",
    rightsAttested: true,
  });
  const source = (await t.run((ctx) => ctx.db.get(sourceId)))!;
  const grantArgs = {
    organizationId: org,
    clientId,
    sources: library
      ? []
      : [
          {
            sourceId,
            generation: source.generation,
            revision: source.updatedAt,
          },
        ],
    ...(library ? { libraryScope: "all" as const } : {}),
    scopes,
    ...(policy
      ? { cloudRequestPolicy: "explicit_per_source_v1" as const }
      : {}),
    expectedVersion: 0,
    expiresAt: Date.now() + 86400000,
    acknowledged: true as const,
  };
  const grant = await owner.mutation(api.assistantGrants.save, grantArgs);
  const request = {
    profileId: org,
    sourceId,
    mode: "work_cloud" as const,
    generation: source.generation,
    revision: source.updatedAt,
    grantVersion: grant.version,
    cloud: {
      model: "synthetic-model",
      effort: "high" as const,
      useOwnPlan: true as const,
      maxApiUsd: 0 as const,
      retainUntil: Date.now() + 86400000,
    },
  };
  const call = (args = request) =>
    assistant.mutation(internal.assistant.requestAnalysis, args);
  return {
    t,
    actorId,
    privateOrg,
    owner,
    assistant,
    identity,
    org,
    sourceId,
    source,
    grant,
    grantArgs,
    request,
    call,
  };
}
it("creates one exact private Cloud job through MCP without repository or per-post app authentication", async () => {
  const s = await setup();
  const queued = await s.call();
  expect(queued).toMatchObject({
    source_id: s.sourceId,
    generation: 1,
    status: "waiting_for_cloud",
    analysis_started: false,
    reused_request: false,
    cloud: {
      funding: "own_subscription",
      max_api_usd: 0,
      publication: "private_only",
    },
  });
  expect(JSON.stringify(queued)).not.toContain("leaseToken");
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.personalAnalysis).toMatchObject({
    executor: "work_cloud",
    generation: 1,
    state: "queued",
    cloud: {
      selectedGeneration: 0,
      selectedRevision: s.source.updatedAt,
      grantVersion: 1,
    },
  });
  const claimed = await s.assistant.mutation(
    internal.workCloudAnalysis.dispatch,
    {
      sourceId: s.sourceId,
      generation: 1,
      taskId: "synthetic-cloud-task",
      operation: "claim",
    },
  );
  expect(claimed).toMatchObject({ leaseToken: expect.any(String) });
  const input = await s.assistant.query(internal.workCloudAnalysis.input, {
    sourceId: s.sourceId,
    generation: 1,
    taskId: "synthetic-cloud-task",
    leaseToken: claimed.leaseToken!,
  });
  expect(input).toMatchObject({
    schemaVersion: "work-cloud-media-v2",
    maxApiUsd: 0,
    requestedModel: "synthetic-model",
  });
  expect(input).not.toHaveProperty("repository");
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
});
it("does not widen old two-scope execution grants", async () => {
  const s = await setup(false);
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(0);
});
it.each(["analysis:request", "analysis:execute"])(
  "requires the current OAuth %s scope",
  async (missing) => {
    const s = await setup();
    const caller = s.t.withIdentity({
      ...s.identity,
      scope: scopes.filter((x) => x !== missing).join(" "),
    });
    await expect(
      caller.mutation(internal.assistant.requestAnalysis, s.request),
    ).rejects.toThrow(/FORBIDDEN|scope/);
  },
);
it.each(["generation", "revision", "grantVersion"] as const)(
  "rejects stale %s even without a preview handshake",
  async (key) => {
    const s = await setup();
    await expect(
      s.call({ ...s.request, [key]: s.request[key] + 1 }),
    ).rejects.toThrow(/STALE|SETUP_REQUIRED/);
  },
);
it("replays an identical unclaimed request without another reservation, generation or quota debit", async () => {
  const s = await setup();
  const first = await s.call(),
    second = await s.call();
  expect(second).toMatchObject({ ...first, reused_request: true });
  expect(
    await s.t.run((ctx) => ctx.db.query("reservations").collect()),
  ).toHaveLength(1);
  expect(
    (await s.t.run((ctx) => ctx.db.query("limits").collect())).find((x) =>
      x.key.startsWith("work-cloud-mcp-hour:"),
    )?.count,
  ).toBe(1);
});
it("recovers an unclaimed request using the current status receipt after a lost reply", async () => {
  const s = await setup();
  await s.call();
  const status = await s.assistant.query(internal.assistant.getJobStatus, {
    profileId: s.org,
    sourceId: s.sourceId,
  });
  expect(status).toMatchObject({
    generation: 1,
    grant_version: 1,
    cloud_request_policy: "explicit_per_source_v1",
    processing: { executor: "work_cloud", state: "queued", stage: "acquiring" },
  });
  expect(
    await s.call({
      ...s.request,
      generation: status.generation,
      revision: status.revision,
    }),
  ).toMatchObject({ generation: 1, reused_request: true });
});
it.each([
  { state: "queued", sourceState: "queued", status: "waiting_for_cloud" },
  { state: "running", sourceState: "processing", status: "processing" },
  { state: "unknown", sourceState: "failed", status: "unknown" },
  { state: "completed", sourceState: "ready", status: "ready" },
] as const)(
  "projects the current $state Cloud job instead of an older waiting local intake",
  async ({ state, sourceState, status }) => {
    const s = await setup(true, true);
    const intakeId = await s.t.run(async (ctx) => {
      await ctx.db.patch(s.sourceId, { assistantIntake: true });
      return ctx.db.insert("assistantIntakes", {
        organizationId: s.org,
        actor: s.actorId,
        clientId,
        grantId: s.grant.id,
        grantVersion: s.grant.version,
        sourceId: s.sourceId,
        generation: s.source.generation,
        revision: s.source.updatedAt,
        analysisGeneration: s.source.generation,
        queueState: "waiting",
        createdAt: Date.now(),
      });
    });
    // The historical local receipt really would mask the Cloud result.
    const localStatus = await s.assistant.query(
      internal.assistant.getJobStatus,
      {
        profileId: s.org,
        sourceId: s.sourceId,
      },
    );
    expect(localStatus).toMatchObject({
      status: "waiting_for_computer",
      receipt: { status: "waiting_for_computer" },
    });
    expect(localStatus.receipt?.credit_route_note).toContain("local computer");
    await s.call();
    await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(s.sourceId))!;
      if (source.personalAnalysis?.executor !== "work_cloud")
        throw Error("Expected Cloud job");
      await ctx.db.patch(s.sourceId, {
        state: sourceState,
        personalAnalysis: {
          ...source.personalAnalysis,
          state,
          stage: state === "queued" ? "acquiring" : "analyzing",
        },
      });
    });
    const before = await s.t.run(async (ctx) => ({
      source: await ctx.db.get(s.sourceId),
      intake: await ctx.db.get(intakeId),
      reservations: await ctx.db.query("reservations").collect(),
    }));
    const result = await s.assistant.query(internal.assistant.getJobStatus, {
      profileId: s.org,
      sourceId: s.sourceId,
    });
    expect(result).toMatchObject({
      status,
      source_status: sourceState,
      processing: { executor: "work_cloud", state },
      receipt: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /waiting_for_computer|processing_locally|credit_route_note|credit_offer/,
    );
    expect(
      await s.t.run(async (ctx) => ({
        source: await ctx.db.get(s.sourceId),
        intake: await ctx.db.get(intakeId),
        reservations: await ctx.db.query("reservations").collect(),
      })),
    ).toEqual(before);
  },
);
it.each(["client", "app"])(
  "requires the %s execution scope after setup",
  async (where) => {
    const s = await setup();
    if (where === "client")
      vi.stubEnv(
        "MCP_CLIENTS",
        JSON.stringify([
          {
            id: clientId,
            name: "Fixture",
            scopes: scopes.filter((x) => x !== "analysis:execute"),
          },
        ]),
      );
    else
      await s.t.run((ctx) =>
        ctx.db.patch(s.grant.id, {
          scopes: scopes.filter((x) => x !== "analysis:execute"),
        }),
      );
    await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
  },
);
it("does not use the private protocol after ownership eligibility or source rights are lost", async () => {
  const s = await setup();
  const otherActor = await s.t.mutation(internal.accounts.syncUser, {
    subject: "another-owner",
    email: "other@example.test",
    name: "Other",
  });
  await s.t.run((ctx) => ctx.db.patch(s.org, { privateOwnerId: otherActor }));
  await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
  const other = await setup();
  await other.t.run((ctx) =>
    ctx.db.patch(other.sourceId, { rightsAttested: false }),
  );
  await expect(other.call()).rejects.toThrow(/FORBIDDEN/);
});

it("uses an explicitly reviewed original sole-owner team without adopting or copying either library", async () => {
  const s = await setup(true, false, true);
  const orgBefore = await s.t.run((ctx) => ctx.db.get(s.org));
  const privateBefore = await s.t.run((ctx) => ctx.db.get(s.privateOrg));
  expect(
    await s.owner.query(api.organizations.previewPrivateAdoption, {
      organizationId: s.org,
    }),
  ).toMatchObject({ eligible: false, reason: "other_private_workspace" });
  expect(
    await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }),
  ).toMatchObject({ privateLibrary: false, workCloudMediaEnabled: true });
  expect(await s.call()).toMatchObject({
    source_id: s.sourceId,
    generation: 1,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.org))).toEqual(orgBefore);
  expect(await s.t.run((ctx) => ctx.db.get(s.privateOrg))).toEqual(
    privateBefore,
  );
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.organizationId).toBe(s.org);
  expect(
    await s.t.run((ctx) => ctx.db.query("sources").collect()),
  ).toHaveLength(1);
  const detail = await s.owner.query(api.product.detail, { id: s.sourceId });
  expect(detail.workCloudHandoff).toMatchObject({ sourceId: s.sourceId });
  const claim = await s.assistant.mutation(
    internal.workCloudAnalysis.dispatch,
    {
      sourceId: s.sourceId,
      generation: 1,
      taskId: "original-team-task",
      operation: "claim",
    },
  );
  expect(
    await s.assistant.query(internal.workCloudAnalysis.input, {
      sourceId: s.sourceId,
      generation: 1,
      taskId: "original-team-task",
      leaseToken: claim.leaseToken!,
    }),
  ).toMatchObject({ sourceId: s.sourceId, generation: 1 });
});

async function disqualifyTeam(
  s: Awaited<ReturnType<typeof setup>>,
  change: "member" | "invitation" | "saturated" | "creator" | "role",
) {
  await s.t.run(async (ctx) => {
    if (change === "member" || change === "creator") {
      const other = await ctx.db.insert("users", {
        subject: "other-team-user",
        email: "other@example.test",
        name: "Other",
        status: "active",
        createdAt: Date.now(),
      });
      if (change === "member")
        await ctx.db.insert("memberships", {
          organizationId: s.org,
          userId: other,
          role: "viewer",
        });
      else await ctx.db.patch(s.org, { createdBy: other });
    } else if (change === "role") {
      const membership = (await ctx.db.query("memberships").collect()).find(
        (row) => row.organizationId === s.org && row.userId === s.actorId,
      )!;
      await ctx.db.patch(membership._id, { role: "admin" });
    } else {
      for (let index = 0; index < (change === "saturated" ? 51 : 1); index++)
        await ctx.db.insert("invitations", {
          organizationId: s.org,
          email: `invite${index}@example.test`,
          role: "viewer",
          tokenHash: String(index).padStart(64, "0"),
          createdBy: s.actorId,
          expiresAt: Date.now() + (change === "saturated" ? -1 : 60000),
        });
    }
  });
}

it.each(["member", "invitation", "saturated", "creator", "role"] as const)(
  "rechecks original-team %s eligibility at setup, grant review, request, recovery, claim and lease use",
  async (change) => {
    const s = await setup(true, false, true);
    await s.call();
    await disqualifyTeam(s, change);
    expect(
      await s.owner.query(api.assistantGrants.setup, { organizationId: s.org }),
    ).toMatchObject({ workCloudMediaEnabled: false });
    const current = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    await expect(
      s.owner.mutation(api.assistantGrants.save, {
        ...s.grantArgs,
        sources: [
          {
            sourceId: s.sourceId,
            generation: current.generation,
            revision: current.updatedAt,
          },
        ],
        expectedVersion: 1,
      }),
    ).rejects.toThrow(/SETUP_REQUIRED/);
    await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
    expect(
      (await s.owner.query(api.product.detail, { id: s.sourceId }))
        .workCloudHandoff,
    ).toBeNull();
    await expect(
      s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        sourceId: s.sourceId,
        generation: 1,
        taskId: "team-task",
        operation: "claim",
      }),
    ).rejects.toThrow(/STALE/);

    const running = await setup(true, false, true);
    await running.call();
    const claim = await running.assistant.mutation(
      internal.workCloudAnalysis.dispatch,
      {
        sourceId: running.sourceId,
        generation: 1,
        taskId: "team-task",
        operation: "claim",
      },
    );
    await disqualifyTeam(running, change);
    const leased = {
      sourceId: running.sourceId,
      generation: 1,
      taskId: "team-task",
      leaseToken: claim.leaseToken!,
    };
    await expect(
      running.assistant.query(internal.workCloudAnalysis.input, leased),
    ).rejects.toThrow(/STALE/);
    await expect(
      running.assistant.mutation(internal.workCloudAnalysis.dispatch, {
        ...leased,
        operation: "heartbeat",
      }),
    ).rejects.toThrow(/STALE/);
  },
);

it("requires a separately reviewed original-team grant and never uses the private-library grant", async () => {
  const s = await setup(false, false, true);
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await s.owner.mutation(api.assistantGrants.save, {
    ...s.grantArgs,
    organizationId: s.privateOrg,
    sources: [],
    libraryScope: "all",
    cloudRequestPolicy: "explicit_per_source_v1",
  });
  await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(0);
});

it.each(["summary", "analysis"] as const)(
  "refuses a failed source with retained %s before clearing any saved result",
  async (field) => {
    const s = await setup(true, true, true);
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        state: "failed",
        ...(field === "summary"
          ? { summary: "Saved result" }
          : { analysis: { insights: [{ title: "Saved insight" }] } }),
      }),
    );
    const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    await expect(
      s.call({ ...s.request, revision: before.updatedAt }),
    ).rejects.toThrow(/unanalyzed post/);
    expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(before);
    expect(
      await s.t.run((ctx) => ctx.db.query("reservations").collect()),
    ).toHaveLength(0);
  },
);

it("keeps other saved posts and their insights unchanged when requesting an original-team source", async () => {
  const s = await setup(true, true, true);
  const saved = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    kind: "text",
    text: "Previously analyzed source",
    title: "Saved post",
    key: "saved-post",
    rightsAttested: true,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(saved, {
      state: "ready",
      summary: "Saved summary",
      analysis: { insights: [{ title: "Saved insight" }] },
    }),
  );
  const before = await s.t.run((ctx) => ctx.db.get(saved));
  await s.call();
  expect(await s.t.run((ctx) => ctx.db.get(saved))).toEqual(before);
});

it("allows expired invitations and app approval on the original sole-owner team", async () => {
  const s = await setup(true, false, true);
  await s.t.run((ctx) =>
    ctx.db.insert("invitations", {
      organizationId: s.org,
      email: "expired@example.test",
      role: "viewer",
      tokenHash: "a".repeat(64),
      createdBy: s.actorId,
      expiresAt: Date.now() - 1,
    }),
  );
  const preview = await s.owner.query(api.workCloudAnalysis.preview, {
    sourceId: s.sourceId,
    grantId: s.grant.id,
    inputKind: "media",
    retainUntil: s.request.cloud.retainUntil,
  });
  expect(
    await s.owner.mutation(api.workCloudAnalysis.approve, {
      sourceId: s.sourceId,
      generation: preview.generation,
      grantId: s.grant.id,
      grantVersion: preview.grantVersion,
      expectedInputHash: preview.inputHash,
      ...s.request.cloud,
      inputKind: "media",
    }),
  ).toMatchObject({ sourceId: s.sourceId, generation: 1 });
});
it("preserves retained results on a failed team text source during app approval", async () => {
  const s = await setup(true, true, true);
  vi.stubEnv("WORK_CLOUD_TEXT_ENABLED", "true");
  vi.stubEnv("WORK_CLOUD_TEXT_VERIFIED", "true");
  const sourceId = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    kind: "text",
    text: "Original evidence",
    title: "Saved text",
    key: "saved-team-text",
    rightsAttested: true,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(sourceId, {
      state: "failed",
      summary: "Saved summary",
      analysis: { insights: [{ title: "Saved insight" }] },
    }),
  );
  const before = (await s.t.run((ctx) => ctx.db.get(sourceId)))!;
  const preview = await s.owner.query(api.workCloudAnalysis.preview, {
    sourceId,
    grantId: s.grant.id,
  });
  await expect(
    s.owner.mutation(api.workCloudAnalysis.approve, {
      sourceId,
      generation: before.generation,
      grantId: s.grant.id,
      grantVersion: s.grant.version,
      expectedInputHash: preview.inputHash,
      model: "synthetic-model",
      effort: "high",
      useOwnPlan: true,
      maxApiUsd: 0,
    }),
  ).rejects.toThrow(/Preserve existing insights/);
  expect(await s.t.run((ctx) => ctx.db.get(sourceId))).toEqual(before);
});
it("does not replace an unknown attempt, even using its new current revision", async () => {
  const s = await setup(true, true);
  await s.call();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    if (source.personalAnalysis?.executor !== "work_cloud")
      throw Error("Expected Cloud job");
    await ctx.db.patch(s.sourceId, {
      state: "failed",
      personalAnalysis: { ...source.personalAnalysis, state: "unknown" },
    });
  });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  await expect(
    s.call({
      ...s.request,
      generation: source.generation,
      revision: source.updatedAt,
    }),
  ).rejects.toThrow(/STALE/);
});
it.each(["model", "effort", "retainUntil"] as const)(
  "does not overwrite queued work with changed %s",
  async (key) => {
    const s = await setup();
    await s.call();
    const changes = {
      model: "different-model",
      effort: "medium" as const,
      retainUntil: s.request.cloud.retainUntil + 1000,
    };
    await expect(
      s.call({
        ...s.request,
        cloud: { ...s.request.cloud, [key]: changes[key] },
      }),
    ).rejects.toThrow(/STALE/);
  },
);
it("rejects a claimed job rather than creating a replacement", async () => {
  const s = await setup();
  await s.call();
  await s.assistant.mutation(internal.workCloudAnalysis.dispatch, {
    sourceId: s.sourceId,
    generation: 1,
    taskId: "claimed-task",
    operation: "claim",
  });
  await expect(s.call()).rejects.toThrow(/STALE/);
  expect((await s.t.run((ctx) => ctx.db.get(s.sourceId)))?.generation).toBe(1);
});
it("checks exact current evidence, not the intake-only fallback", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, { updatedAt: s.source.updatedAt + 1 }),
  );
  await expect(
    s.call({ ...s.request, revision: s.source.updatedAt + 1 }),
  ).rejects.toThrow(/STALE/);
});
it.each([
  "WORK_CLOUD_MEDIA_ENABLED",
  "WORK_CLOUD_MEDIA_VERIFIED",
  "RESTORE_LOCK",
  "DISABLE_INFERENCE",
])("fails closed on %s", async (key) => {
  const s = await setup();
  vi.stubEnv(key, key.startsWith("WORK_") ? "false" : "true");
  await expect(s.call()).rejects.toThrow();
});
it("requires fresh app authentication to install the new policy", async () => {
  const s = await setup(false);
  const stale = s.t.withIdentity({
    subject,
    auth_time: Math.floor(Date.now() / 1000) - 1000,
  });
  await expect(
    stale.mutation(api.assistantGrants.save, {
      ...s.grantArgs,
      cloudRequestPolicy: "explicit_per_source_v1",
      expectedVersion: 1,
    }),
  ).rejects.toThrow(/Sign in again/);
});
it("binds the reviewed media policy and respects revocation", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch(s.grant.id, { cloudRequestPolicyHash: "a".repeat(64) }),
  );
  await expect(s.call()).rejects.toThrow(/SETUP_REQUIRED/);
  await s.owner.mutation(api.assistantGrants.revoke, {
    id: s.grant.id,
    expectedVersion: 1,
  });
  await expect(s.call()).rejects.toThrow(/FORBIDDEN/);
});
it("rejects expired retention, project or credit options and cross-mode Cloud options", async () => {
  const s = await setup();
  await expect(
    s.call({
      ...s.request,
      cloud: { ...s.request.cloud, retainUntil: Date.now() - 1 },
    }),
  ).rejects.toThrow();
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      maxCredits: 0,
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      project: "anything",
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
  await expect(
    s.assistant.mutation(internal.assistant.requestAnalysis, {
      ...s.request,
      mode: "local",
    }),
  ).rejects.toThrow(/INVALID_INPUT/);
});
it("bounds new requests per actor/hour, while retrying queued work is free", async () => {
  const s = await setup(true, true);
  await s.call();
  await s.t.run(async (ctx) => {
    const row = (await ctx.db.query("limits").collect()).find((x) =>
      x.key.startsWith("work-cloud-mcp-hour:"),
    )!;
    await ctx.db.patch(row._id, { count: 6 });
  });
  expect(await s.call()).toMatchObject({ reused_request: true });
  const other = await s.owner.mutation(api.product.capture, {
    organizationId: s.org,
    kind: "url",
    url: "https://www.youtube.com/watch?v=abcdefghijl",
    title: "Second synthetic source",
    key: "cloud-second-fixture",
    rightsAttested: true,
  });
  const source = (await s.t.run((ctx) => ctx.db.get(other)))!;
  const request = {
    ...s.request,
    sourceId: other,
    generation: source.generation,
    revision: source.updatedAt,
  };
  await expect(s.call(request)).rejects.toThrow(/QUOTA_EXCEEDED/);
  vi.advanceTimersByTime(3600000);
  expect(await s.call(request)).toMatchObject({ reused_request: false });
});
