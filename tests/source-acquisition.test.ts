import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { acquireGithubSource } from "../packages/providers/github-source";
import { createEvidence, registryHash } from "../packages/sources/evidence";
import type {
  SourceRevision,
  SourceTransport,
} from "../packages/sources/types";
const fixture = vi.hoisted(() => ({
  transport: undefined as SourceTransport | undefined,
}));
vi.mock("../packages/providers/source-transport", () => ({
  createPublicSourceTransport: () => fixture.transport!,
}));
const modules = import.meta.glob("../convex/**/*.ts");
const commit = "a".repeat(40),
  tree = "b".repeat(40),
  text = "# Fixture\nA permitted technical claim.";
const blobSha = createHash("sha1")
  .update(`blob ${Buffer.byteLength(text)}\0`)
  .update(text)
  .digest("hex");
function json(value: unknown) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield new TextEncoder().encode(JSON.stringify(value));
    })(),
  };
}
function transportFixture() {
  return vi.fn<SourceTransport>(async ({ url }) => {
    const path = new URL(url).pathname;
    if (path === "/repos/example/project")
      return json({
        id: 42,
        private: false,
        full_name: "example/project",
        default_branch: "main",
      });
    if (path.includes("/commits/"))
      return json({ sha: commit, commit: { tree: { sha: tree } } });
    if (path.includes("/git/trees/"))
      return json({
        sha: tree,
        truncated: false,
        tree: [
          {
            path: "README.md",
            mode: "100644",
            type: "blob",
            sha: blobSha,
            size: Buffer.byteLength(text),
          },
        ],
      });
    if (path.includes("/git/blobs/"))
      return json({
        sha: blobSha,
        encoding: "base64",
        size: Buffer.byteLength(text),
        content: Buffer.from(text).toString("base64"),
      });
    throw Error("No fixture response");
  });
}
function currentEligibility() {
  vi.stubEnv(
    "REDDIT_SOURCE_ELIGIBILITY_JSON",
    JSON.stringify({
      status: "verified",
      evidenceId: "fixture-permission-not-live",
      expiresAt: Date.now() + 86400000,
      authentication: "oauth",
      workloads: ["selected_thread_read", "private_summary", "citation_export"],
      retention: { maxAgeMs: 86400000, deletionWithinMs: 3600000 },
    }),
  );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  fixture.transport = undefined;
});
async function setup() {
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
  vi.stubEnv("GITHUB_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCES_ENABLED", "true");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "fixture-oauth-only");
  currentEligibility();
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ownerId = await t.mutation(internal.accounts.syncUser, {
    subject: "source-owner",
    email: "source@example.test",
    name: "Fixture source owner",
  });
  const otherId = await t.mutation(internal.accounts.syncUser, {
    subject: "source-other",
    email: "other@example.test",
    name: "Fixture other owner",
  });
  const owner = t.withIdentity({ subject: "source-owner" }),
    other = t.withIdentity({ subject: "source-other" });
  const organizationId = await owner.mutation(
      api.organizations.createPrivate,
      {},
    ),
    otherOrganizationId = await other.mutation(
      api.organizations.createPrivate,
      {},
    );
  const sourceId = await t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId,
      sourceType: "github_repository",
      kind: "url",
      canonical: "https://github.com/example/project",
      url: "https://github.com/example/project",
      key: "fixture-direct-source",
      title: "Fixture source",
      tags: [],
      rightsAttested: true,
      generation: 1,
      state: "saved",
      coverage: "metadata_only",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const transport = transportFixture();
  fixture.transport = transport;
  const prepare = () =>
    owner.mutation(api.sourceAcquisition.prepare, {
      id: sourceId,
      key: "fixture-acquisition-001",
      rightsBasis: "fixture_owner_permission",
    });
  return {
    t,
    owner,
    other,
    ownerId,
    otherId,
    organizationId,
    otherOrganizationId,
    sourceId,
    transport,
    prepare,
  };
}
it.each(["absent", "malformed", "expired", "oauth_missing", "disabled"])(
  "persists GitHub inspection and selected acquisition with Reddit %s without starting or charging inference",
  async (change) => {
    const s = await setup(),
      permission = JSON.parse(process.env.REDDIT_SOURCE_ELIGIBILITY_JSON!);
    if (change === "absent") vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "");
    if (change === "malformed")
      vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "{");
    if (change === "expired")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...permission, expiresAt: Date.now() - 1 }),
      );
    if (change === "oauth_missing") vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    if (change === "disabled") vi.stubEnv("REDDIT_SOURCES_ENABLED", "false");
    const request = await s.prepare();
    expect(
      (await s.owner.query(api.sourceAcquisition.status, { id: s.sourceId }))
        .enabled,
    ).toBe(true);
    expect(await s.prepare()).toEqual(request);
    await expect(
      s.owner.action(api.sourceAcquisitionActions.acquire, {
        id: request.id,
        version: request.version,
      }),
    ).rejects.toThrow();
    expect(s.transport).not.toHaveBeenCalled();
    expect(
      await s.owner.action(api.sourceAcquisitionActions.inspect, {
        id: request.id,
        version: request.version,
      }),
    ).toEqual({ accepted: true });
    const status = await s.owner.query(api.sourceAcquisition.status, {
      id: s.sourceId,
    });
    expect(
      status.request?.selection.files.map((f: { path: string }) => f.path),
    ).toEqual(["README.md"]);
    await expect(
      s.owner.mutation(api.sourceAcquisition.select, {
        id: request.id,
        version: status.request!.version,
        paths: [".env"],
      }),
    ).rejects.toThrow();
    const selected = await s.owner.mutation(api.sourceAcquisition.select, {
      id: request.id,
      version: status.request!.version,
      paths: ["README.md"],
    });
    expect(
      await s.owner.action(api.sourceAcquisitionActions.acquire, selected),
    ).toEqual({ accepted: true });
    await s.t.run(async (ctx) => {
      const source = (await ctx.db.get(s.sourceId))!,
        revision = (await ctx.db.get(source.currentRevisionId!))!,
        row = (await ctx.db.get(request.id))!;
      expect(source).toMatchObject({
        generation: 2,
        text,
        state: "saved",
        retrievalState: "ready",
      });
      expect(revision).toMatchObject({
        generation: 2,
        state: "current",
        text,
        sourceId: s.sourceId,
        organizationId: s.organizationId,
      });
      expect(row.requestCount).toBe(7);
      expect(row.byteCount).toBeGreaterThan(Buffer.byteLength(text));
      expect(await ctx.db.query("reservations").collect()).toEqual([]);
    });
    await expect(
      s.other.query(api.sourceAcquisition.status, { id: s.sourceId }),
    ).rejects.toThrow();
  },
);
it.each(["absent", "malformed", "expired", "oauth_missing", "disabled"])(
  "does not prepare or dispatch Reddit with %s setup even when GitHub is enabled",
  async (change) => {
    const s = await setup(),
      permission = JSON.parse(process.env.REDDIT_SOURCE_ELIGIBILITY_JSON!);
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        sourceType: "reddit_thread",
        canonical: "https://www.reddit.com/r/example/comments/abc123/",
        url: "https://www.reddit.com/r/example/comments/abc123/",
      }),
    );
    if (change === "absent") vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "");
    if (change === "malformed")
      vi.stubEnv("REDDIT_SOURCE_ELIGIBILITY_JSON", "{");
    if (change === "expired")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...permission, expiresAt: Date.now() - 1 }),
      );
    if (change === "oauth_missing") vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    if (change === "disabled") vi.stubEnv("REDDIT_SOURCES_ENABLED", "");
    expect(
      (await s.owner.query(api.sourceAcquisition.status, { id: s.sourceId }))
        .enabled,
    ).toBe(false);
    await expect(s.prepare()).rejects.toThrow("SETUP_REQUIRED");
    expect(s.transport).not.toHaveBeenCalled();
    expect(
      await s.t.run((ctx) => ctx.db.query("sourceAcquisitions").collect()),
    ).toEqual([]);
  },
);
it("requires GitHub activation and current source rights before making requests", async () => {
  const s = await setup();
  for (const env of ["GITHUB_SOURCES_ENABLED", "DIRECT_SOURCES_ENABLED"]) {
    const previous = process.env[env];
    vi.stubEnv(env, "");
    await expect(s.prepare()).rejects.toThrow();
    vi.stubEnv(env, previous);
  }
  expect(s.transport).not.toHaveBeenCalled();
  await s.t.run((ctx) => ctx.db.patch(s.sourceId, { rightsAttested: false }));
  await expect(s.prepare()).rejects.toThrow();
});
it.each([
  "current",
  "policy_changed",
  "deletion_changed",
  "disabled",
  "oauth_revoked",
  "workload_revoked",
  "expired",
  "wrong_lease",
])(
  "accepts Reddit completion only with its current permission and lease: %s",
  async (change) => {
    const s = await setup(),
      now = Date.now(),
      canonical = "https://www.reddit.com/r/example/comments/abc123/";
    vi.stubEnv("GITHUB_SOURCES_ENABLED", "false");
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        sourceType: "reddit_thread",
        canonical,
        url: canonical,
      }),
    );
    const permission = JSON.parse(process.env.REDDIT_SOURCE_ELIGIBILITY_JSON!);
    const request = await s.prepare();
    const job = await s.owner.mutation(internal.sourceAcquisition.claim, {
      id: request.id,
      version: request.version,
      phase: "acquire",
    });
    const record = await createEvidence({
      kind: "reddit_post",
      postId: "abc123",
      itemId: "abc123",
      parentId: null,
      author: "fixture-author",
      role: "op",
      availability: "available",
      createdAt: null,
      editedAt: null,
      excerpt: text,
      canonicalUrl: canonical,
      observedAt: now,
    });
    const revision: SourceRevision = {
      schemaVersion: "1.0.0",
      sourceType: "reddit_thread",
      canonical,
      providerIdentity: "reddit:abc123",
      contentHash: await registryHash([record]),
      adapterVersion: "fixture",
      observedAt: now,
      rightsBasis: "verified_reddit_contract:fixture-permission-not-live",
      retention: {
        retainUntil: now + 3600000,
        deletionWithinMs: 3600000,
        policyEvidenceId: permission.evidenceId,
      },
      coverage: { method: "fixture", retrieved: 1, omitted: 0, omissions: [] },
    };
    if (change === "policy_changed")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...permission, evidenceId: "different-permission" }),
      );
    if (change === "deletion_changed")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({
          ...permission,
          retention: { ...permission.retention, deletionWithinMs: 1000 },
        }),
      );
    if (change === "disabled") vi.stubEnv("REDDIT_SOURCES_ENABLED", "false");
    if (change === "oauth_revoked") vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
    if (change === "workload_revoked")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({
          ...permission,
          workloads: ["selected_thread_read", "private_summary"],
        }),
      );
    if (change === "expired")
      vi.stubEnv(
        "REDDIT_SOURCE_ELIGIBILITY_JSON",
        JSON.stringify({ ...permission, expiresAt: Date.now() - 1 }),
      );
    const completion = s.t.mutation(internal.sourceAcquisition.finish, {
      id: request.id,
      lease: change === "wrong_lease" ? "foreign-lease" : job.lease,
      phase: "acquire",
      result: { status: "ready", revision, evidence: [record], text },
    });
    if (change === "policy_changed" || change === "deletion_changed")
      await expect(completion).rejects.toThrow(
        "Provider retention authority changed",
      );
    else expect(await completion).toEqual({ accepted: change === "current" });
    await s.t.run(async (ctx) => {
      const rows = await ctx.db.query("sourceRevisions").collect();
      expect(rows).toHaveLength(change === "current" ? 1 : 0);
      expect((await ctx.db.get(s.sourceId))!.text).toBe(
        change === "current" ? text : undefined,
      );
      expect(await ctx.db.query("reservations").collect()).toEqual([]);
    });
    expect(s.transport).not.toHaveBeenCalled();
  },
);
it("fences cancelled, stale, revoked and expired completions before retaining any text", async () => {
  const scenarios = [
    "cancel",
    "generation",
    "revision",
    "membership",
    "actor",
    "deadline",
    "disabled",
    "provider_disabled",
    "restore_locked",
    "capture_disabled",
  ] as const;
  for (const scenario of scenarios) {
    const s = await setup(),
      prepared = await s.prepare();
    const job = await s.owner.mutation(internal.sourceAcquisition.claim, {
      id: prepared.id,
      version: prepared.version,
      phase: "inspect",
    });
    if (scenario === "cancel")
      await s.owner.mutation(api.sourceAcquisition.cancel, {
        id: prepared.id,
        version: job.version,
      });
    if (scenario === "generation")
      await s.t.run((ctx) => ctx.db.patch(s.sourceId, { generation: 2 }));
    if (scenario === "revision")
      await s.t.run(async (ctx) => {
        const source = (await ctx.db.get(s.sourceId))!;
        await ctx.db.patch(s.sourceId, { updatedAt: source.updatedAt + 1 });
      });
    if (scenario === "membership")
      await s.t.run(async (ctx) => {
        const member = await ctx.db
          .query("memberships")
          .withIndex("by_pair", (q) =>
            q.eq("organizationId", s.organizationId).eq("userId", s.ownerId),
          )
          .unique();
        await ctx.db.delete(member!._id);
      });
    if (scenario === "actor")
      await s.t.run((ctx) => ctx.db.patch(s.ownerId, { status: "deleting" }));
    if (scenario === "deadline")
      await s.t.run((ctx) =>
        ctx.db.patch(prepared.id, { deadline: Date.now() - 1 }),
      );
    if (scenario === "disabled") vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    if (scenario === "provider_disabled")
      vi.stubEnv("GITHUB_SOURCES_ENABLED", "false");
    if (scenario === "restore_locked") vi.stubEnv("RESTORE_LOCK", "true");
    if (scenario === "capture_disabled") vi.stubEnv("DISABLE_CAPTURE", "true");
    expect(
      (
        await s.t.mutation(internal.sourceAcquisition.providerClaim, {
          id: prepared.id,
          lease: job.lease,
          provider: "github",
        })
      ).allowed,
      scenario,
    ).toBe(false);
    expect(
      await s.t.mutation(internal.sourceAcquisition.finish, {
        id: prepared.id,
        lease: job.lease,
        phase: "inspect",
        result: { status: "unavailable", reason: "fixture_failure" },
      }),
      scenario,
    ).toEqual({ accepted: false });
    await s.t.run(async (ctx) => {
      expect(await ctx.db.query("sourceRevisions").collect()).toEqual([]);
      expect((await ctx.db.get(s.sourceId))?.text).toBeUndefined();
    });
    vi.unstubAllEnvs();
  }
});
it("rejects a forged acquisition registry and accepts only the current selected revision", async () => {
  const s = await setup(),
    prepared = await s.prepare();
  await s.owner.action(api.sourceAcquisitionActions.inspect, {
    id: prepared.id,
    version: prepared.version,
  });
  const status = await s.owner.query(api.sourceAcquisition.status, {
    id: s.sourceId,
  });
  const selected = await s.owner.mutation(api.sourceAcquisition.select, {
    id: prepared.id,
    version: status.request!.version,
    paths: ["README.md"],
  });
  const job = await s.owner.mutation(internal.sourceAcquisition.claim, {
    ...selected,
    phase: "acquire",
  });
  const result = await acquireGithubSource(
    {
      url: "https://github.com/example/project",
      commit,
      repositoryId: 42,
      selectedPaths: ["README.md"],
      rightsBasis: "fixture_owner_permission",
    },
    { transport: s.transport },
  );
  if (result.status !== "ready") throw Error("Expected fixture result");
  await expect(
    s.t.mutation(internal.sourceAcquisition.finish, {
      id: prepared.id,
      lease: job.lease,
      phase: "acquire",
      result: {
        ...result,
        evidence: [{ ...result.evidence[0], excerpt: "invented" }],
      },
    }),
  ).rejects.toThrow();
  expect(
    await s.t.mutation(internal.sourceAcquisition.finish, {
      id: prepared.id,
      lease: job.lease,
      phase: "acquire",
      result,
    }),
  ).toEqual({ accepted: true });
  expect(
    await s.t.mutation(internal.sourceAcquisition.finish, {
      id: prepared.id,
      lease: job.lease,
      phase: "acquire",
      result,
    }),
  ).toEqual({ accepted: false });
  await s.t.run(async (ctx) => {
    expect(await ctx.db.query("sourceRevisions").collect()).toHaveLength(1);
  });
});
it("shares one conservative service quota across workspaces and yields consecutive turns fairly", async () => {
  const s = await setup(),
    first = await s.prepare();
  const sourceB = await s.t.run((ctx) =>
    ctx.db.insert("sources", {
      organizationId: s.otherOrganizationId,
      sourceType: "github_repository",
      kind: "url",
      canonical: "https://github.com/example/project",
      url: "https://github.com/example/project",
      key: "fixture-other-source",
      title: "Other private source",
      tags: [],
      rightsAttested: true,
      generation: 1,
      state: "saved",
      coverage: "metadata_only",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const second = await s.other.mutation(api.sourceAcquisition.prepare, {
    id: sourceB,
    key: "fixture-acquisition-002",
    rightsBasis: "fixture_owner_permission",
  });
  const a = await s.owner.mutation(internal.sourceAcquisition.claim, {
      id: first.id,
      version: first.version,
      phase: "inspect",
    }),
    b = await s.other.mutation(internal.sourceAcquisition.claim, {
      id: second.id,
      version: second.version,
      phase: "inspect",
    });
  for (let n = 0; n < 3; n++)
    expect(
      await s.t.mutation(internal.sourceAcquisition.providerClaim, {
        id: a.id,
        lease: a.lease,
        provider: "github",
      }),
    ).toMatchObject({ allowed: true });
  expect(
    await s.t.mutation(internal.sourceAcquisition.providerClaim, {
      id: a.id,
      lease: a.lease,
      provider: "github",
    }),
  ).toMatchObject({ allowed: false });
  expect(
    await s.t.mutation(internal.sourceAcquisition.providerClaim, {
      id: b.id,
      lease: b.lease,
      provider: "github",
    }),
  ).toMatchObject({ allowed: true });
  await s.t.run(async (ctx) => {
    const quotas = await ctx.db.query("sourceProviderQuotas").collect();
    expect(quotas).toHaveLength(1);
    expect(quotas[0].used).toBe(4);
    await ctx.db.patch(quotas[0]._id, { used: 40 });
  });
  expect(
    await s.t.mutation(internal.sourceAcquisition.providerClaim, {
      id: a.id,
      lease: a.lease,
      provider: "github",
    }),
  ).toMatchObject({ allowed: false });
  expect(s.transport).not.toHaveBeenCalled();
});
it("records supplied-text fallback without provider setup, inference or a successful direct-fetch claim", async () => {
  const s = await setup(),
    prepared = await s.prepare();
  const job = await s.owner.mutation(internal.sourceAcquisition.claim, {
    id: prepared.id,
    version: prepared.version,
    phase: "inspect",
  });
  const original = await s.t.run((ctx) => ctx.db.get(s.sourceId));
  vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
  vi.stubEnv("REDDIT_SOURCE_OAUTH_TOKEN", "");
  const args = {
    id: s.sourceId,
    expectedGeneration: original!.generation,
    expectedRevision: original!.updatedAt,
    text: "User supplied excerpt with incomplete context.",
    rightsAttested: true as const,
  };
  await expect(
    s.other.mutation(api.sourceAcquisition.supplyText, args),
  ).rejects.toThrow();
  const supplied = await s.owner.mutation(
    api.sourceAcquisition.supplyText,
    args,
  );
  expect(s.transport).not.toHaveBeenCalled();
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!,
      revision = (await ctx.db.get(supplied.revisionId))!;
    expect(source).toMatchObject({
      sourceType: "github_repository",
      retrievalState: "partial",
      generation: 2,
      state: "saved",
      text: args.text,
    });
    expect(revision.revision).toMatchObject({
      sourceType: "supplied_text",
      coverage: { method: "user_supplied_unverified" },
    });
    expect(revision.evidence[0]).toMatchObject({
      kind: "supplied_text",
      originalUrl: original!.url,
      startOffset: 0,
      endOffset: args.text.length,
      provenance: "user_supplied_unverified",
    });
    expect((await ctx.db.get(prepared.id))!.error).toBe(
      "supplied_text_replaced_retrieval",
    );
    expect(await ctx.db.query("reservations").collect()).toEqual([]);
  });
  await expect(
    s.owner.mutation(api.sourceAcquisition.supplyText, args),
  ).rejects.toThrow();
  expect(
    await s.t.mutation(internal.sourceAcquisition.finish, {
      id: prepared.id,
      lease: job.lease,
      phase: "inspect",
      result: { status: "unavailable", reason: "fixture_failure" },
    }),
  ).toEqual({ accepted: false });
});
it("requires explicit retry after an expired lease and rejects the predecessor completion", async () => {
  const s = await setup(),
    prepared = await s.prepare();
  const first = await s.owner.mutation(internal.sourceAcquisition.claim, {
    id: prepared.id,
    version: prepared.version,
    phase: "inspect",
  });
  await s.t.run((ctx) =>
    ctx.db.patch(prepared.id, { deadline: Date.now() - 1 }),
  );
  const second = await s.owner.mutation(internal.sourceAcquisition.claim, {
    id: prepared.id,
    version: first.version,
    phase: "inspect",
  });
  expect(second.lease).not.toBe(first.lease);
  expect(
    await s.t.mutation(internal.sourceAcquisition.finish, {
      id: prepared.id,
      lease: first.lease,
      phase: "inspect",
      result: { status: "unavailable", reason: "fixture_failure" },
    }),
  ).toEqual({ accepted: false });
});
it("denies expired retention immediately and scrubs provider text without resurrecting it", async () => {
  const s = await setup();
  const url = "https://www.reddit.com/r/example/comments/abc123/";
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      sourceType: "reddit_thread",
      url,
      canonical: url,
    }),
  );
  s.transport.mockImplementation(async () =>
    json([
      {
        kind: "Listing",
        data: {
          children: [
            {
              kind: "t3",
              data: {
                id: "abc123",
                subreddit: "example",
                title: "Provider discussion",
                selftext: "Provider retained text",
                author: "writer",
                created_utc: 100,
                edited: false,
              },
            },
          ],
        },
      },
      { kind: "Listing", data: { children: [] } },
    ]),
  );
  const prepared = await s.prepare();
  expect(
    await s.owner.action(api.sourceAcquisitionActions.acquire, {
      id: prepared.id,
      version: prepared.version,
    }),
  ).toEqual({ accepted: true });
  const source = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  expect(source.sourceRetentionUntil).toBeGreaterThan(Date.now());
  vi.useFakeTimers();
  vi.setSystemTime(source.sourceRetentionUntil! + 1);
  expect(
    await s.owner.query(api.sourceAcquisition.status, { id: s.sourceId }),
  ).toMatchObject({
    enabled: false,
    retrievalState: "unavailable",
    request: null,
    reason: "source_retention_expired",
  });
  expect(
    await s.t.mutation(internal.sourceAcquisition.expire, {
      revisionId: source.currentRevisionId!,
    }),
  ).toEqual({ expired: true });
  await s.t.run(async (ctx) => {
    const expired = (await ctx.db.get(s.sourceId))!,
      revision = (await ctx.db.get(source.currentRevisionId!))!;
    expect(expired).toMatchObject({
      state: "failed",
      rightsAttested: false,
      generation: source.generation + 1,
    });
    expect(expired.text).toBeUndefined();
    expect(expired.analysis).toBeUndefined();
    expect(revision).toMatchObject({
      state: "removed",
      text: "",
      evidence: [],
      revision: { reason: "provider_retention_expired" },
    });
  });
  expect(
    await s.t.mutation(internal.sourceAcquisition.expire, {
      revisionId: source.currentRevisionId!,
    }),
  ).toEqual({ expired: false });
});
it("expires superseded provider history without mutating a later supplied revision and bounds retained history", async () => {
  const s = await setup();
  const oldId = await s.t.run((ctx) =>
    ctx.db.insert("sourceRevisions", {
      organizationId: s.organizationId,
      sourceId: s.sourceId,
      generation: 1,
      contentHash: "old-audit-hash",
      revision: { retention: { retainUntil: Date.now() - 1 } },
      evidence: [],
      text: "Expired provider excerpt",
      state: "superseded",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  const original = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const supplied = await s.owner.mutation(api.sourceAcquisition.supplyText, {
    id: s.sourceId,
    expectedGeneration: original.generation,
    expectedRevision: original.updatedAt,
    text: "Current supplied content",
    rightsAttested: true,
  });
  expect(
    await s.t.mutation(internal.sourceAcquisition.expire, {
      revisionId: oldId,
    }),
  ).toEqual({ expired: true });
  await s.t.run(async (ctx) => {
    expect((await ctx.db.get(s.sourceId))!.text).toBe(
      "Current supplied content",
    );
    expect((await ctx.db.get(s.sourceId))!.currentRevisionId).toBe(
      supplied.revisionId,
    );
    expect((await ctx.db.get(oldId))!.text).toBe("");
    for (let i = 0; i < 23; i++)
      await ctx.db.insert("sourceRevisions", {
        organizationId: s.organizationId,
        sourceId: s.sourceId,
        generation: 1,
        contentHash: `fixture-${i}`,
        revision: { removedAt: Date.now() },
        evidence: [],
        text: "",
        state: "removed",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  await expect(
    s.owner.mutation(api.sourceAcquisition.prepare, {
      id: s.sourceId,
      key: "fixture-history-bound",
      rightsBasis: "fixture_permission",
    }),
  ).rejects.toThrow("history limit");
  expect(s.transport).not.toHaveBeenCalled();
});
it("requires fresh current rights after revocation and re-inspects GitHub instead of reusing a selection", async () => {
  const s = await setup(),
    original = await s.prepare();
  await s.owner.action(api.sourceAcquisitionActions.inspect, {
    id: original.id,
    version: original.version,
  });
  const inspected = await s.owner.query(api.sourceAcquisition.status, {
    id: s.sourceId,
  });
  await s.owner.mutation(api.sourceAcquisition.select, {
    id: original.id,
    version: inspected.request!.version,
    paths: ["README.md"],
  });
  await s.t.run((ctx) =>
    ctx.db.patch(s.sourceId, {
      rightsAttested: false,
      text: "Revoked provider bytes",
      summary: "Revoked summary",
      analysis: { insights: [{ id: "old", claim: "Revoked claim" }] },
      categoryOverride: ["Authored filing"],
    }),
  );
  const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
  const args = {
    id: s.sourceId,
    key: "fixture-fresh-github",
    rightsBasis: "New permitted retrieval",
    expectedGeneration: before.generation,
    expectedRevision: before.updatedAt,
  };
  await expect(
    s.owner.mutation(api.sourceAcquisition.prepare, args),
  ).rejects.toThrow();
  await expect(
    s.owner.mutation(api.sourceAcquisition.prepare, {
      ...args,
      rightsAttested: true,
      expectedRevision: before.updatedAt - 1,
    }),
  ).rejects.toThrow();
  const fresh = await s.owner.mutation(api.sourceAcquisition.prepare, {
    ...args,
    rightsAttested: true,
  });
  await s.t.run(async (ctx) => {
    const source = (await ctx.db.get(s.sourceId))!;
    expect(source.generation).toBe(before.generation + 1);
    expect(source.text).toBeUndefined();
    expect(source.summary).toBeUndefined();
    expect(source.analysis).toBeUndefined();
    expect(source.categoryOverride).toEqual(["Authored filing"]);
    expect((await ctx.db.get(original.id))!.state).toBe("unavailable");
    expect((await ctx.db.get(fresh.id))!.selectedPaths).toEqual([]);
  });
  const calls = s.transport.mock.calls.length;
  await expect(
    s.owner.action(api.sourceAcquisitionActions.acquire, {
      id: fresh.id,
      version: fresh.version,
    }),
  ).rejects.toThrow();
  expect(s.transport).toHaveBeenCalledTimes(calls);
  await s.owner.action(api.sourceAcquisitionActions.inspect, {
    id: fresh.id,
    version: fresh.version,
  });
  const status = await s.owner.query(api.sourceAcquisition.status, {
    id: s.sourceId,
  });
  const selected = await s.owner.mutation(api.sourceAcquisition.select, {
    id: fresh.id,
    version: status.request!.version,
    paths: ["README.md"],
  });
  await expect(
    s.owner.action(api.sourceAcquisitionActions.acquire, selected),
  ).resolves.toEqual({ accepted: true });
  await s.t.run(async (ctx) => {
    expect((await ctx.db.get(s.sourceId))!.text).toBe(text);
    expect(await ctx.db.query("reservations").collect()).toEqual([]);
  });
});
it("reacquires expired provider evidence before or after cleanup without letting late expiry wipe fresh evidence", async () => {
  for (const cleanupFirst of [false, true]) {
    const s = await setup();
    const url = "https://www.reddit.com/r/example/comments/abc123/";
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        sourceType: "reddit_thread",
        url,
        canonical: url,
      }),
    );
    let body = "Previously retained provider bytes";
    s.transport.mockImplementation(async () =>
      json([
        {
          kind: "Listing",
          data: {
            children: [
              {
                kind: "t3",
                data: {
                  id: "abc123",
                  subreddit: "example",
                  title: "Discussion",
                  selftext: body,
                  author: "writer",
                  created_utc: 100,
                  edited: false,
                },
              },
            ],
          },
        },
        { kind: "Listing", data: { children: [] } },
      ]),
    );
    const first = await s.prepare();
    await s.owner.action(api.sourceAcquisitionActions.acquire, {
      id: first.id,
      version: first.version,
    });
    const old = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    const manualId = await s.t.run(async (ctx) => {
      const topicId = await ctx.db.insert("knowledgeTopics", {
        organizationId: s.organizationId,
        key: "authored-topic",
        name: "My authored filing",
        pinned: true,
        version: 1,
        state: "ready",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return ctx.db.insert("knowledgeMembers", {
        organizationId: s.organizationId,
        topicId,
        sourceId: s.sourceId,
        generation: old.generation,
        revision: old.updatedAt,
        insightId: "old-point",
        sourceTitle: "Expired provider title",
        manual: true,
        excluded: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await s.t.run((ctx) =>
      ctx.db.patch(s.sourceId, {
        summary: "Expired provider summary",
        analysis: { old: "Expired analysis" },
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(old.sourceRetentionUntil! + 1);
    currentEligibility();
    if (cleanupFirst)
      await s.t.mutation(internal.sourceAcquisition.expire, {
        revisionId: old.currentRevisionId!,
      });
    const before = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    const status = await s.owner.query(api.sourceAcquisition.status, {
      id: s.sourceId,
    });
    expect(status).toMatchObject({
      enabled: true,
      requiresRightsReview: true,
      request: null,
    });
    const args = {
      id: s.sourceId,
      key: "fixture-expired-renewal",
      rightsBasis: "Reviewed new permission",
      expectedGeneration: before.generation,
      expectedRevision: before.updatedAt,
    };
    await expect(
      s.owner.mutation(api.sourceAcquisition.prepare, args),
    ).rejects.toThrow();
    await expect(
      s.owner.mutation(api.sourceAcquisition.prepare, {
        id: s.sourceId,
        key: args.key,
        rightsBasis: args.rightsBasis,
        rightsAttested: true,
      }),
    ).rejects.toThrow();
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "false");
    await expect(
      s.owner.mutation(api.sourceAcquisition.prepare, {
        ...args,
        rightsAttested: true,
      }),
    ).rejects.toThrow();
    vi.stubEnv("DIRECT_SOURCES_ENABLED", "true");
    const fresh = await s.owner.mutation(api.sourceAcquisition.prepare, {
      ...args,
      rightsAttested: true,
    });
    expect(fresh.id).not.toBe(first.id);
    await s.t.run(async (ctx) => {
      const renewed = (await ctx.db.get(s.sourceId))!,
        tombstone = (await ctx.db.get(old.currentRevisionId!))!;
      expect(renewed).toMatchObject({
        rightsAttested: true,
        generation: before.generation + 1,
        state: "saved",
      });
      for (const field of [
        "text",
        "summary",
        "analysis",
        "currentRevisionId",
        "sourceRetentionUntil",
      ] as const)
        expect(renewed[field]).toBeUndefined();
      expect(tombstone).toMatchObject({
        state: "removed",
        text: "",
        evidence: [],
      });
      const row = (await ctx.db.get(fresh.id))!;
      expect(row.generation).toBe(renewed.generation);
      expect(row.sourceRevision).toBe(renewed.updatedAt);
      expect(row.lease).toBeUndefined();
      expect(row.requestCount).toBe(0);
      const manual = (await ctx.db.get(manualId))!;
      expect(manual).toMatchObject({
        manual: true,
        excluded: true,
        retainedHistory: true,
        generation: old.generation,
        revision: old.updatedAt,
      });
      expect(manual.sourceTitle).toBeUndefined();
    });
    body = "Fresh provider bytes obtained after review";
    const calls = s.transport.mock.calls.length;
    await expect(
      s.owner.action(api.sourceAcquisitionActions.acquire, {
        id: fresh.id,
        version: fresh.version,
      }),
    ).resolves.toEqual({ accepted: true });
    expect(s.transport.mock.calls.length).toBeGreaterThan(calls);
    const current = (await s.t.run((ctx) => ctx.db.get(s.sourceId)))!;
    expect(current.currentRevisionId).not.toBe(old.currentRevisionId);
    expect(current.text).toContain(body);
    await s.t.mutation(internal.sourceAcquisition.expire, {
      revisionId: old.currentRevisionId!,
    });
    expect(await s.t.run((ctx) => ctx.db.get(s.sourceId))).toEqual(current);
    expect(current.analysis).toBeUndefined();
    vi.useRealTimers();
  }
});
