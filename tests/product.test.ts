import workflowTest from "@convex-dev/workflow/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { reserve } from "../convex/product";
import {
  safeSourceUrl,
  safePath,
  validatePaths,
  prState,
  monthlyAnchor,
  taxTreatment,
  invoiceDeadline,
  containsSecret,
} from "../packages/policy";
import {
  insightOutput,
  proposalOutput,
  runnerJob,
} from "../packages/contracts";
import fixture from "../fixtures/insight.json";
import proposalFixture from "../fixtures/proposal.json";
import jobFixture from "../fixtures/runner-job.json";
const modules = import.meta.glob("../convex/**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workflowTest.register(t);
  for (const subject of ["a", "b"])
    await t.mutation(internal.accounts.syncUser, {
      subject,
      email: `${subject}@example.test`,
      name: subject,
    });
  const a = t.withIdentity({ subject: "a" }),
    b = t.withIdentity({ subject: "b" });
  const org = await a.mutation(api.organizations.create, { name: "A" }),
    other = await b.mutation(api.organizations.create, { name: "B" });
  return { t, a, b, org, other };
}
describe("VibeScroller product boundaries", () => {
  it("requires fresh owner authentication, binds customer requests to credential revisions and preserves managed runs on AI revocation", async () => {
    const model = {
      id: "synthetic-model",
      version: "synthetic-v1",
      inputUsdCentsPerMillion: 75,
      outputUsdCentsPerMillion: 450,
      maxInputBytes: 10000,
      maxOutputTokens: 4000,
      verifiedAt: Date.now(),
      structuredOutput: true,
      dataPolicyUrl: "https://example.test/policy",
    };
    vi.stubEnv("OPENAI_CUSTOMER_MODELS_JSON", JSON.stringify([model]));
    try {
      const { t, a, b, org } = await setup();
      await expect(
        a.query(api.jobs.authorizeCredential, { organizationId: org }),
      ).rejects.toThrow("Sign in again");
      const fresh = t.withIdentity({
        subject: "a",
        auth_time: Math.floor(Date.now() / 1000),
      });
      const owner = await fresh.query(api.jobs.authorizeCredential, {
        organizationId: org,
      });
      await expect(
        b.query(api.jobs.customerRoutes, { organizationId: org }),
      ).rejects.toThrow();
      await expect(
        t.mutation(internal.jobs.storeSecret, {
          organizationId: org,
          provider: "openai",
          ciphertext: "synthetic-ciphertext",
          keyVersion: "synthetic",
        }),
      ).rejects.toThrow("FORBIDDEN");
      await t.mutation(internal.jobs.storeSecret, {
        organizationId: org,
        provider: "openai",
        actorId: owner,
        ciphertext: "synthetic-ciphertext",
        keyVersion: "synthetic",
      });
      const saved = (await t.query(internal.jobs.secret, {
        organizationId: org,
        provider: "openai",
      }))!;
      expect(
        await a.query(api.jobs.customerRoutes, { organizationId: org }),
      ).toMatchObject({ status: "stored", models: [] });
      await expect(
        t.mutation(internal.jobs.verifiedCredential, {
          organizationId: org,
          actorId: owner,
          revision: "stale",
          models: [model.id],
        }),
      ).rejects.toThrow("APPROVAL_STALE");
      await t.mutation(internal.jobs.verifiedCredential, {
        organizationId: org,
        actorId: owner,
        revision: saved.revision!,
        models: [model.id, "invented"],
      });
      const routes = await a.query(api.jobs.customerRoutes, {
        organizationId: org,
      });
      expect(routes.models).toHaveLength(1);
      expect(JSON.stringify(routes)).not.toContain("synthetic-ciphertext");
      const repositoryId = await t.mutation(internal.jobs.saveRepository, {
        organizationId: org,
        installationId: 1,
        providerId: 1,
        fullName: "test/synthetic-key",
        sha: "a".repeat(40),
        branch: "main",
        manifest: ["README.md"],
        context: "Synthetic",
      });
      const runs = await t.run(async (ctx) => {
        const now = Date.now();
        const sourceId = await ctx.db.insert("sources", {
          organizationId: org,
          createdAt: now,
          updatedAt: now,
          key: "synthetic-byo",
          canonical: "synthetic-byo",
          kind: "text",
          title: "Synthetic",
          state: "ready",
          coverage: "caption_only",
          tags: [],
          rightsAttested: true,
          generation: 1,
        });
        const proposalId = await ctx.db.insert("proposals", {
          organizationId: org,
          createdAt: now,
          updatedAt: now,
          sourceId,
          repositoryId,
          baseSha: "a".repeat(40),
          profileVersion: 1,
          disposition: "relevant",
          title: "Synthetic",
          detail: {},
          review: "accepted",
          version: 1,
        });
        const base = {
          organizationId: org,
          createdAt: now,
          updatedAt: now,
          proposalId,
          repositoryId,
          approvedBy: owner,
          planHash: "b".repeat(64),
          baseSha: "a".repeat(40),
          version: 1,
          executor: "cloud",
          maxCredits: 20,
          allowedPaths: ["README.md"],
          highRisk: false,
          state: "running",
          generation: 1,
          expiresAt: now + 60000,
          leaseUntil: now + 60000,
          events: [],
        };
        return {
          customer: await ctx.db.insert("runs", {
            ...base,
            fundingRoute: "customer_api_key",
            credentialRevision: saved.revision,
            customerModel: model,
            maxProviderUsdCents: routes.models[0].maxProviderUsdCents,
            providerRequestState: "reserved",
          }),
          managed: await ctx.db.insert("runs", {
            ...base,
            fundingRoute: "managed_api",
          }),
        };
      });
      await t.mutation(internal.jobs.startCustomerRequest, {
        id: runs.customer,
        generation: 1,
      });
      await expect(
        t.mutation(internal.jobs.startCustomerRequest, {
          id: runs.customer,
          generation: 1,
        }),
      ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
      await t.mutation(internal.jobs.storeSecret, {
        organizationId: org,
        provider: "openai",
        actorId: owner,
        ciphertext: "synthetic-replacement-ciphertext",
        keyVersion: "synthetic",
      });
      const replacement = (await t.query(internal.jobs.secret, {
        organizationId: org,
        provider: "openai",
      }))!;
      expect(replacement.revision).not.toBe(saved.revision);
      expect(
        await t.mutation(internal.jobs.rotateCiphertext, {
          id: replacement._id,
          previous: saved.ciphertext,
          ciphertext: "synthetic-migration",
          keyVersion: "next",
        }),
      ).toBe(false);
      expect(
        await t.mutation(internal.jobs.rotateCiphertext, {
          id: replacement._id,
          previous: replacement.ciphertext,
          ciphertext: "synthetic-migration",
          keyVersion: "next",
        }),
      ).toBe(true);
      expect(
        (
          await t.query(internal.jobs.secret, {
            organizationId: org,
            provider: "openai",
          })
        )?.revision,
      ).toBe(replacement.revision);
      await a.mutation(api.jobs.revoke, {
        organizationId: org,
        provider: "openai",
      });
      expect(
        await t.query(internal.jobs.customerRequestActive, {
          id: runs.customer,
          generation: 1,
        }),
      ).toBe(false);
      await t.mutation(internal.jobs.recordCustomerUsage, {
        id: runs.customer,
        generation: 1,
        cents: 1,
      });
      const states = await t.run(async (ctx) => ({
        customer: await ctx.db.get(runs.customer),
        managed: await ctx.db.get(runs.managed),
      }));
      expect(states.customer).toMatchObject({
        state: "canceled",
        generation: 2,
        providerRequestState: "settled",
        providerUsdCents: 1,
      });
      expect(states.managed?.state).toBe("running");
      expect(
        await a.query(api.jobs.customerRoutes, { organizationId: org }),
      ).toMatchObject({ status: "disconnected", models: [] });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("quotes a profile draft once, denies foreign access and discards stale output without confirming a profile", async () => {
    const { t, a, b, org } = await setup();
    const id = await t.mutation(internal.jobs.saveRepository, {
      organizationId: org,
      installationId: 1,
      providerId: 1,
      fullName: "test/synthetic-profile",
      sha: "a".repeat(40),
      branch: "main",
      manifest: ["README.md"],
      context: "Synthetic test only",
      contextFiles: ["README.md"],
      contextExcerpts: [
        {
          path: "README.md",
          startLine: 1,
          endLine: 1,
          content: "Synthetic owned repository",
          blobSha: "b".repeat(40),
        },
      ],
    });
    await expect(
      b.mutation(api.profiles.start, {
        id,
        key: "synthetic-key-001",
        maxCredits: 10,
      }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.profiles.start, {
        id,
        key: "synthetic-key-001",
        maxCredits: 1,
      }),
    ).rejects.toThrow("QUOTE_CHANGED");
    const first = await a.mutation(api.profiles.start, {
      id,
      key: "synthetic-key-001",
      maxCredits: 10,
    });
    await expect(
      a.mutation(api.profiles.start, {
        id,
        key: "synthetic-key-002",
        maxCredits: 10,
      }),
    ).rejects.toThrow("SOURCE_BUSY");
    await a.mutation(api.product.saveProfile, {
      id,
      profile: "Owner correction",
      confirmed: false,
      enabled: true,
    });
    expect(
      await t.mutation(internal.profiles.finish, {
        id,
        organizationId: org,
        key: first.key,
        sha: first.repo.sha,
        version: first.repo.profileVersion,
        profile: "Stale unconfirmed draft",
        credits: 0,
      }),
    ).toEqual({ saved: false });
    const second = await a.mutation(api.profiles.start, {
      id,
      key: "synthetic-key-002",
      maxCredits: 10,
    });
    expect(
      await t.mutation(internal.profiles.finish, {
        id,
        organizationId: org,
        key: second.key,
        sha: second.repo.sha,
        version: second.repo.profileVersion,
        profile: "Synthetic unconfirmed draft",
        credits: 0,
      }),
    ).toEqual({ saved: true });
    const cached = await a.mutation(api.profiles.start, {
      id,
      key: "synthetic-key-003",
      maxCredits: 10,
    });
    expect(cached.cached).toBe(true);
    const repo = await t.run((ctx) => ctx.db.get(id));
    expect(repo?.profile).toBe("Owner correction");
    expect(repo?.confirmed).toBe(false);
    const publicRows = await a.query(api.product.repositories, {
      organizationId: org,
    });
    expect(publicRows[0]).not.toHaveProperty("context");
    expect(publicRows[0]).not.toHaveProperty("contextExcerpts");
    expect(publicRows[0]).not.toHaveProperty("manifestEntries");
    // An older extractor's draft cannot masquerade as the detailed refresh.
    await t.run((ctx) =>
      ctx.db.patch(id, {
        profileDraftProcessingVersion: undefined,
        profile: "Confirmed parent and teacher context",
        confirmed: true,
      }),
    );
    const upgraded = await a.mutation(api.profiles.start, {
      id,
      key: "synthetic-key-004",
      maxCredits: 10,
    });
    expect(upgraded.cached).toBe(false);
    await t.mutation(internal.profiles.finish, {
      id,
      organizationId: org,
      key: upgraded.key,
      sha: upgraded.repo.sha,
      version: upgraded.repo.profileVersion,
      profile: "New detailed proposal",
      credits: 0,
    });
    const preserved = await t.run((ctx) => ctx.db.get(id));
    expect(preserved?.profile).toBe("Confirmed parent and teacher context");
    expect(preserved?.confirmed).toBe(true);
    expect(preserved?.profileDraft).toBe("New detailed proposal");
  });
  it("fences a local device lease and requires termination before another claim", async () => {
    const { t, org } = await setup();
    const a = t.withIdentity({
      subject: "a",
      auth_time: Math.floor(Date.now() / 1000),
    });
    const deviceId = await a.mutation(api.devices.start, {
      organizationId: org,
      name: "Synthetic protocol device",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
    });
    await a.mutation(api.devices.approve, {
      id: deviceId,
      fingerprint: "a".repeat(64),
      credentialHash: "c".repeat(64),
    });
    expect(
      await t.mutation(internal.runnerProtocol.dispatch, {
        credentialHash: "c".repeat(64),
        operation: "poll",
      }),
    ).toMatchObject({ lease: null, blocked: expect.any(String) });
    const repositoryId = await t.mutation(internal.jobs.saveRepository, {
      organizationId: org,
      installationId: 1,
      providerId: 1,
      fullName: "test/synthetic",
      sha: "a".repeat(40),
      branch: "main",
      manifest: ["docs/note.md"],
      context: "Synthetic",
    });
    const runId = await t.run(async (ctx) => {
      const now = Date.now(),
        owner = (await ctx.db.get(deviceId))!.owner;
      await ctx.db.patch(deviceId, {
        capabilities: ["windows_isolation_verified"],
        isolationEvidenceHash: "d".repeat(64),
      });
      await ctx.db.patch(repositoryId, { confirmed: true });
      const sourceId = await ctx.db.insert("sources", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: "local-fixture",
        canonical: "local-fixture",
        kind: "text",
        title: "Synthetic",
        state: "ready",
        coverage: "caption_only",
        tags: [],
        rightsAttested: true,
        generation: 1,
      });
      const proposalId = await ctx.db.insert("proposals", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        sourceId,
        repositoryId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        disposition: "relevant",
        title: "Synthetic",
        detail: {},
        review: "accepted",
        version: 1,
        planHash: "e".repeat(64),
        plan: {
          files: [{ path: "docs/note.md", isNew: false }],
          tests: ["Synthetic bounded check"],
        },
      });
      return ctx.db.insert("runs", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        proposalId,
        repositoryId,
        approvedBy: owner,
        planHash: "e".repeat(64),
        baseSha: "a".repeat(40),
        version: 1,
        executor: "local",
        fundingRoute: "local_codex_subscription",
        maxCredits: 0,
        allowedPaths: ["docs/note.md"],
        highRisk: false,
        state: "waiting_for_laptop",
        generation: 1,
        expiresAt: now + 86400000,
        leaseUntil: 0,
        events: [],
      });
    });
    const prior = process.env.LOCAL_ISOLATION_VERIFIED;
    process.env.LOCAL_ISOLATION_VERIFIED = "true";
    try {
      const first: any = await t.mutation(internal.runnerProtocol.dispatch, {
        credentialHash: "c".repeat(64),
        operation: "poll",
      });
      expect(first.lease.envelope.jobId).toBe(runId);
      expect(first.lease.envelope.leaseGeneration).toBe(2);
      expect(first.lease.envelope.maxCredits).toBe(0);
      expect(
        await t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "poll",
        }),
      ).toMatchObject({ lease: null, reconcile: { id: runId } });
      await a.mutation(api.jobs.cancel, { id: runId });
      await expect(
        t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "heartbeat",
          id: runId,
          generation: 2,
        }),
      ).rejects.toThrow();
      expect(
        await t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "poll",
        }),
      ).toMatchObject({ lease: null, reconcile: { state: "canceled" } });
      await expect(
        t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "fail",
          id: runId,
          generation: 2,
          terminated: false,
        }),
      ).rejects.toThrow();
      expect(
        await t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "fail",
          id: runId,
          generation: 2,
          terminated: true,
        }),
      ).toEqual({ stopped: true });
      await t.run(async (ctx) => {
        expect((await ctx.db.get(deviceId))!.activeRunId).toBeUndefined();
      });
      await a.mutation(api.devices.revoke, { id: deviceId });
      await expect(
        t.mutation(internal.runnerProtocol.dispatch, {
          credentialHash: "c".repeat(64),
          operation: "status",
        }),
      ).rejects.toThrow();
    } finally {
      if (prior === undefined) delete process.env.LOCAL_ISOLATION_VERIFIED;
      else process.env.LOCAL_ISOLATION_VERIFIED = prior;
    }
  });
  it("allows viewers to read their workspace while denying source, plan and execution mutations", async () => {
    const { t, a, b, org } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "viewer-source",
      kind: "text",
      title: "Synthetic viewer record",
      text: "Private workspace text",
      rightsAttested: true,
    });
    await t.run(async (ctx) => {
      const user = (await ctx.db
        .query("users")
        .withIndex("by_subject", (q) => q.eq("subject", "b"))
        .unique())!;
      await ctx.db.insert("memberships", {
        organizationId: org,
        userId: user._id,
        role: "viewer",
      });
    });
    expect(
      (await b.query(api.product.library, { organizationId: org })).items,
    ).toHaveLength(1);
    expect((await b.query(api.product.detail, { id })).text).toBe(
      "Private workspace text",
    );
    await expect(
      b.mutation(api.product.capture, {
        organizationId: org,
        key: "viewer-write",
        kind: "text",
        title: "Denied",
        text: "Denied",
        rightsAttested: true,
      }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.product.editSource, { id, summary: "Denied", tags: [] }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.product.processSource, { id, maxCredits: 10 }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.product.deleteSource, { id }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.assets.grant, {
        organizationId: org,
        key: `${org}/denied`,
        size: 100,
        type: "audio/wav",
      }),
    ).rejects.toThrow();
    await expect(
      b.query(api.billing.authorize, { organizationId: org }),
    ).rejects.toThrow();
  });
  it("exports all pages with owner checks, deletion filtering and private evidence redaction", async () => {
    const { t, a, b, org, other } = await setup();
    await t.run(async (ctx) => {
      for (let n = 0; n < 14; n++)
        await ctx.db.insert("sources", {
          organizationId: org,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          key: `export:${n}`,
          coverage: "caption_only",
          tags: [],
          title: `Synthetic export ${n}`,
          kind: "text",
          canonical: `export:${n}`,
          state: n === 5 ? "deleted" : "saved",
          generation: 1,
          text: "x".repeat(60000),
          objectKey: `${org}/private/${n}`,
          rightsAttested: true,
        });
    });
    const asOf = Date.now();
    let cursor: string | null = null;
    const records: unknown[] = [];
    let pages = 0;
    do {
      const page: { page: unknown[]; isDone: boolean; continueCursor: string } =
        await a.query(api.jobs.exportPage, {
          organizationId: org,
          section: "sources",
          cursor,
          asOf,
        });
      records.push(...page.page);
      cursor = page.isDone ? null : page.continueCursor;
      pages++;
    } while (cursor !== null);
    expect(pages).toBe(3);
    expect(records).toHaveLength(13);
    expect(JSON.stringify(records)).not.toContain("objectKey");
    await expect(
      b.query(api.jobs.exportPage, {
        organizationId: org,
        section: "sources",
        cursor: null,
        asOf,
      }),
    ).rejects.toThrow();
    expect(
      (
        await b.query(api.jobs.exportPage, {
          organizationId: other,
          section: "sources",
          cursor: null,
          asOf,
        })
      ).page,
    ).toHaveLength(0);
    await t.run(async (ctx) => {
      const user = (await ctx.db
        .query("users")
        .withIndex("by_subject", (q) => q.eq("subject", "a"))
        .unique())!;
      const membership = (await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", org).eq("userId", user._id),
        )
        .unique())!;
      await ctx.db.patch(membership._id, { role: "viewer" });
    });
    await expect(
      a.query(api.jobs.exportPage, {
        organizationId: org,
        section: "sources",
        cursor: null,
        asOf,
      }),
    ).rejects.toThrow();
  });
  it("reuses only fingerprinted media stages and settles the prior compute hold once", async () => {
    const { t, a, org } = await setup();
    const sourceId = await t.run(async (ctx) => {
      const now = Date.now(),
        key = `${org}/synthetic-media`;
      const id = await ctx.db.insert("sources", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: "synthetic-cache",
        canonical: "synthetic-cache",
        kind: "upload",
        title: "Synthetic cache test",
        state: "failed",
        coverage: "metadata_only",
        rightsAttested: true,
        tags: [],
        generation: 1,
        objectKey: key,
      });
      await ctx.db.insert("assets", {
        organizationId: org,
        sourceId: id,
        createdAt: now,
        updatedAt: now,
        key,
        state: "complete",
        etag: "verified-synthetic-fingerprint",
        size: 100,
        type: "audio/wav",
      });
      return id;
    });
    await t.mutation(internal.commerce.budgetFixture, {
      organizationId: org,
      key: `source:${sourceId}:1`,
      max: 10,
    });
    const evidence = [
      {
        kind: "transcript",
        id: `transcript:${sourceId}:1:0`,
        startMs: 0,
        endMs: 1000,
      },
    ];
    const payload = {
      transcript: [
        {
          id: evidence[0].id,
          text: "Synthetic evidence",
          startMs: 0,
          endMs: 1000,
        },
      ],
      observations: [],
      evidence,
      warnings: [],
      computeCredits: 2,
    };
    await t.mutation(internal.product.stageMedia, {
      id: sourceId,
      generation: 1,
      transcript: "Synthetic evidence",
      coverage: "audio_only",
      evidence,
      cache: { pipelineVersion: "synthetic-v1", payload },
    });
    expect(
      await t.query(internal.product.cachedMediaStage, {
        id: sourceId,
        pipelineVersion: "wrong-version",
      }),
    ).toBeNull();
    expect(
      await t.query(internal.product.cachedMediaStage, {
        id: sourceId,
        pipelineVersion: "synthetic-v1",
      }),
    ).not.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(sourceId, { generation: 2, state: "queued" });
    });
    expect(
      await t.mutation(internal.product.stageMedia, {
        id: sourceId,
        generation: 1,
        transcript: "Late stale text",
        coverage: "audio_only",
        evidence,
      }),
    ).toBe(false);
    await t.mutation(internal.commerce.budgetFixture, {
      organizationId: org,
      key: `source:${sourceId}:2`,
      max: 10,
    });
    const output = {
      ...fixture,
      sourceId,
      processingRunId: `${sourceId}:2`,
      coverage: "audio_only",
      insights: fixture.insights.map((i) => ({ ...i, evidence })),
    };
    const receipt = {
      generation: 2,
      route: "google_metered",
      model: "gemini-3.5-flash-lite",
      costPolicy: "google-eu-standard-2026-10-03-v1",
      startedAt: 1000,
      completedAt: 2000,
      inputTokens: 100,
      outputTokens: 100,
      inferenceMicros: 500,
      computeCredits: 0,
      chargedCredits: 1,
      reusedMedia: true,
    };
    await t.run((ctx) => ctx.db.patch(sourceId, { processingStartedAt: 1000 }));
    await expect(
      t.mutation(internal.product.commitAnalysis, {
        id: sourceId,
        generation: 2,
        output,
        credits: 1,
        receipt: { ...receipt, generation: 3 },
      }),
    ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
    await expect(
      t.mutation(internal.product.commitAnalysis, {
        id: sourceId,
        generation: 2,
        output,
        credits: 1,
        receipt: { ...receipt, startedAt: 999 },
      }),
    ).rejects.toThrow("COST_RECONCILIATION_REQUIRED");
    await t.mutation(internal.product.commitAnalysis, {
      id: sourceId,
      generation: 2,
      output,
      credits: 1,
      reusedMediaGeneration: 1,
      receipt,
    });
    await t.mutation(internal.product.commitAnalysis, {
      id: sourceId,
      generation: 2,
      output,
      credits: 1,
      reusedMediaGeneration: 1,
    });
    await t.run(async (ctx) => {
      const wallet = await ctx.db.query("wallets").first();
      expect(wallet?.spent).toBe(3);
      expect(wallet?.reserved).toBe(0);
    });
    await a.mutation(api.product.deleteSource, { id: sourceId });
    await t.run(async (ctx) => {
      const deleted = await ctx.db.get(sourceId);
      expect(deleted?.processingReceipt).toBeUndefined();
      expect(deleted?.processingStartedAt).toBeUndefined();
      expect(deleted?.speechProvenance).toBeUndefined();
    });
    expect(
      await t.query(internal.product.cachedMediaStage, {
        id: sourceId,
        pipelineVersion: "synthetic-v1",
      }),
    ).toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.query("mediaStages").collect()).toHaveLength(0);
    });
  });
  it("reverses only the refunded invoice's allowance contribution and does not revive annual grants", async () => {
    const { t, org } = await setup();
    const start = Date.now(),
      end = start + 30 * 86400000;
    const base = {
      organizationId: org,
      subscription: "sub_invoice_refund",
      start,
      end,
      interval: "monthly" as const,
      verifiedPayment: true,
    };
    await t.mutation(internal.commerce.grantPeriod, {
      ...base,
      tier: "starter",
      invoiceId: "in_initial",
    });
    await t.mutation(internal.commerce.grantPeriod, {
      ...base,
      tier: "pro",
      upgradeAt: start + (end - start) / 2,
      invoiceId: "in_upgrade",
    });
    await t.mutation(internal.commerce.reversePayment, {
      organizationId: org,
      paymentId: "pi_upgrade",
      invoiceId: "in_upgrade",
      total: 1000,
      refunded: 1000,
      invoiceTotal: 1000,
    });
    await t.run(async (ctx) => {
      const pool = (await ctx.db.query("creditPools").collect())[0];
      expect(pool.granted).toBe(425);
      expect(pool.revoked).toBe(175);
    });
    await t.mutation(internal.commerce.reversePayment, {
      organizationId: org,
      paymentId: "pi_initial",
      invoiceId: "in_initial",
      total: 19000,
      refunded: 19000,
      invoiceTotal: 19000,
    });
    await t.mutation(internal.commerce.grantPeriod, {
      ...base,
      start: end,
      end: end + 30 * 86400000,
      tier: "starter",
      invoiceId: "in_initial",
    });
    await t.run(async (ctx) => {
      const pools = await ctx.db.query("creditPools").collect();
      expect(pools.every((p) => p.revoked === p.granted)).toBe(true);
    });
  });
  it("reverses cumulative purchased-credit refunds once, including reordered grant delivery", async () => {
    const { t, org, other } = await setup();
    const args = {
      organizationId: org,
      paymentId: "pi_synthetic_refund",
      total: 1000,
      refunded: 500,
    };
    await t.mutation(internal.commerce.reversePayment, args);
    await t.mutation(internal.commerce.grantTopup, {
      organizationId: org,
      paymentId: args.paymentId,
      credits: 200,
    });
    await t.mutation(internal.commerce.reversePayment, args);
    await t.run(async (ctx) => {
      const pool = (await ctx.db.query("creditPools").collect())[0];
      expect(pool.granted).toBe(200);
      expect(pool.revoked).toBe(100);
    });
    await t.mutation(internal.commerce.reversePayment, {
      ...args,
      refunded: 1000,
    });
    await t.mutation(internal.commerce.reversePayment, args);
    await expect(
      t.mutation(internal.commerce.reversePayment, {
        ...args,
        organizationId: other,
        refunded: 1000,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.commerce.budgetFixture, {
        organizationId: org,
        key: "refunded-budget",
        max: 31,
      }),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
    await t.run(async (ctx) => {
      expect((await ctx.db.query("billingReversals").collect()).length).toBe(1);
    });
  });
  it("aggregates several refunded payments against the invoice total and preserves reversals on later allowances", async () => {
    const { t, org } = await setup();
    const start = Date.now(),
      end = start + 30 * 86400000;
    const grant = {
      organizationId: org,
      subscription: "sub_synthetic_multi",
      tier: "starter" as const,
      interval: "monthly" as const,
      start,
      end,
      verifiedPayment: true,
      invoiceId: "in_synthetic_multi",
    };
    await t.mutation(internal.commerce.grantPeriod, grant);
    const refund = {
      organizationId: org,
      invoiceId: grant.invoiceId,
      invoiceTotal: 1000,
      total: 500,
      refunded: 250,
    };
    await t.mutation(internal.commerce.reversePayment, {
      ...refund,
      paymentId: "pi_synthetic_first",
    });
    const pool = () =>
      t.run(async (ctx) => (await ctx.db.query("creditPools").collect())[0]);
    expect((await pool()).revoked).toBe(62);
    await t.mutation(internal.commerce.reversePayment, {
      ...refund,
      paymentId: "pi_synthetic_second",
    });
    expect((await pool()).revoked).toBe(125);
    await t.mutation(internal.commerce.reversePayment, {
      ...refund,
      paymentId: "pi_synthetic_first",
      refunded: 100,
    });
    expect((await pool()).revoked).toBe(125);
    await expect(
      t.mutation(internal.commerce.reversePayment, {
        ...refund,
        paymentId: "pi_synthetic_first",
        invoiceId: "in_changed",
        refunded: 500,
      }),
    ).rejects.toThrow("REFUND_RECONCILIATION_REQUIRED");
    for (const paymentId of ["pi_synthetic_first", "pi_synthetic_second"])
      await t.mutation(internal.commerce.reversePayment, {
        ...refund,
        paymentId,
        refunded: 500,
      });
    expect((await pool()).revoked).toBe(250);
    await t.mutation(internal.commerce.grantPeriod, {
      ...grant,
      start: end,
      end: end + 30 * 86400000,
    });
    const all = await t.run((ctx) => ctx.db.query("creditPools").collect());
    expect(all.every((p) => p.revoked === p.granted)).toBe(true);
    expect(
      await t.run((ctx) => ctx.db.query("billingReversals").collect()),
    ).toHaveLength(2);
    await t.mutation(internal.commerce.grantPeriod, {
      ...grant,
      subscription: "sub_exact_synthetic",
      tier: "pro",
      invoiceId: "in_exact_synthetic",
      start: end + 30 * 86400000,
      end: end + 60 * 86400000,
    });
    await t.mutation(internal.commerce.reversePayment, {
      organizationId: org,
      paymentId: "pi_exact_synthetic",
      invoiceId: "in_exact_synthetic",
      invoiceTotal: 1000,
      total: 1000,
      refunded: 290,
    });
    const contribution = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("creditFunding")
            .withIndex("by_invoice", (q) =>
              q.eq("invoiceId", "in_exact_synthetic"),
            )
            .collect()
        )[0],
    );
    expect(contribution.revoked).toBe(174);
  });
  it("binds plan-change quotes to the owner and claims each approval once", async () => {
    const { t, a, b, org } = await setup();
    const now = Math.floor(Date.now() / 1000);
    const args = {
      organizationId: org,
      subscriptionId: "sub_synthetic",
      itemId: "si_synthetic",
      oldPrice: "price_old",
      newPrice: "price_new",
      tier: "pro" as const,
      interval: "monthly" as const,
      prorationDate: now,
      periodStart: now - 86400,
      periodEnd: now + 86400,
      amount: 200,
      currency: "eur",
    };
    const quoteId = await a.mutation(internal.billingChanges.create, args);
    await expect(
      b.query(api.billingChanges.quote, { id: quoteId }),
    ).rejects.toThrow();
    await expect(
      b.mutation(internal.billingChanges.claim, { id: quoteId }),
    ).rejects.toThrow();
    await a.mutation(internal.billingChanges.claim, { id: quoteId });
    await expect(
      a.mutation(internal.billingChanges.claim, { id: quoteId }),
    ).rejects.toThrow();
    const expired = await a.mutation(internal.billingChanges.create, args);
    await t.run(async (ctx) => {
      await ctx.db.patch(expired, { expiresAt: Date.now() - 1 });
    });
    await expect(
      a.mutation(internal.billingChanges.claim, { id: expired }),
    ).rejects.toThrow("QUOTE_EXPIRED");
  });
  it("scopes and deduplicates PR webhooks, pages reconciliation, and rejects stale observations", async () => {
    const { t, org } = await setup();
    const repositoryId = await t.mutation(internal.jobs.saveRepository, {
      organizationId: org,
      installationId: 11,
      providerId: 22,
      fullName: "test/synthetic",
      sha: "a".repeat(40),
      branch: "main",
      manifest: [],
      context: "Synthetic test only",
    });
    const ids = await t.run(async (ctx) => {
      const now = Date.now(),
        actor = (await ctx.db.query("users").first())!._id;
      const sourceId = await ctx.db.insert("sources", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        key: "webhook-source",
        canonical: "webhook-source",
        title: "Synthetic",
        kind: "text",
        state: "ready",
        coverage: "caption_only",
        tags: [],
        rightsAttested: true,
        generation: 0,
      });
      const proposalId = await ctx.db.insert("proposals", {
        organizationId: org,
        createdAt: now,
        updatedAt: now,
        sourceId,
        repositoryId,
        baseSha: "a".repeat(40),
        profileVersion: 1,
        disposition: "relevant",
        title: "Synthetic",
        detail: {},
        review: "approved",
        version: 1,
      });
      const ids = [];
      for (let n = 1; n <= 51; n++)
        ids.push(
          await ctx.db.insert("runs", {
            organizationId: org,
            createdAt: now,
            updatedAt: now,
            proposalId,
            repositoryId,
            approvedBy: actor,
            planHash: "synthetic",
            baseSha: "a".repeat(40),
            version: 1,
            executor: "cloud",
            fundingRoute: "prepaid",
            maxCredits: 1,
            allowedPaths: [],
            highRisk: false,
            state: "completed",
            generation: 1,
            expiresAt: now,
            leaseUntil: now,
            events: [],
            prNumber: n,
            prState: "draft",
            observedAt: 100,
          }),
        );
      return ids;
    });
    expect(
      await t.query(internal.jobs.workerRun, { id: ids[0] }),
    ).not.toBeNull();
    await t.run(async (ctx) => {
      const run = (await ctx.db.get(ids[0]))!;
      const membership = (await ctx.db
        .query("memberships")
        .withIndex("by_pair", (q) =>
          q.eq("organizationId", org).eq("userId", run.approvedBy),
        )
        .unique())!;
      await ctx.db.patch(membership._id, { role: "viewer" });
    });
    expect(await t.query(internal.jobs.workerRun, { id: ids[0] })).toBeNull();
    const delivery = {
      delivery: "synthetic-delivery",
      installationId: 11,
      repositoryId: 22,
      prNumber: 1,
    };
    await t.mutation(internal.jobs.enqueuePR, {
      ...delivery,
      delivery: "foreign-delivery",
      installationId: 99,
    });
    await t.run(async (ctx) => {
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(0);
    });
    await t.mutation(internal.jobs.enqueuePR, delivery);
    await t.mutation(internal.jobs.enqueuePR, delivery);
    await t.run(async (ctx) => {
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(1);
    });
    const first = await t.query(internal.jobs.prRuns, {});
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const second = await t.query(internal.jobs.prRuns, {
      cursor: first.continueCursor,
    });
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);
    await t.mutation(internal.jobs.projectPR, {
      id: ids[0],
      state: "merged",
      mergedAt: "2026-09-30T00:00:00Z",
      observedAt: 200,
    });
    await t.mutation(internal.jobs.projectPR, {
      id: ids[0],
      state: "draft",
      observedAt: 150,
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(ids[0]))?.prState).toBe("merged");
    });
    const reversed = {
      mergeCommitSha: "a".repeat(40),
      revertCommitSha: "b".repeat(40),
      url: `https://github.com/test/synthetic/commit/${"b".repeat(40)}`,
      observedAt: 210,
    };
    await expect(
      t.mutation(internal.jobs.projectPR, {
        id: ids[0],
        state: "merged",
        observedAt: 210,
        mergeCommitSha: "a".repeat(40),
        reverted: {
          ...reversed,
          url: "https://github.com/foreign/repo/commit/" + "b".repeat(40),
        },
      }),
    ).rejects.toThrow("INVALID_EVIDENCE");
    await t.mutation(internal.jobs.projectPR, {
      id: ids[0],
      state: "merged",
      observedAt: 210,
      mergeCommitSha: "a".repeat(40),
      reverted: reversed,
      revertStatus: "verified",
    });
    await t.mutation(internal.jobs.projectPR, {
      id: ids[0],
      state: "access_lost",
      observedAt: 220,
    });
    await t.run(async (ctx) => {
      const r = await ctx.db.get(ids[0]);
      expect(r?.mergedAt).toBe("2026-09-30T00:00:00Z");
      expect(r?.reverted).toEqual(reversed);
      expect(r?.prState).toBe("access_lost");
    });
  });
  it("imports a full 500-row paid batch and deduplicates it without per-row credit use", async () => {
    const { t, a, org } = await setup();
    const start = Date.now();
    await t.mutation(internal.commerce.grantPeriod, {
      organizationId: org,
      subscription: "sub_bulk_test",
      tier: "pro",
      interval: "monthly",
      start,
      end: start + 31 * 86400000,
      verifiedPayment: true,
    });
    const rows = Array.from({ length: 500 }, (_, i) => ({
      url: `https://youtube.com/watch?v=synthetic${i}`,
    }));
    const args = {
      organizationId: org,
      key: "bulk-500-test",
      format: "json" as const,
      text: JSON.stringify(rows),
      rightsAttested: true,
    };
    expect((await a.mutation(api.imports.links, args)).accepted).toBe(500);
    const replay = await a.mutation(api.imports.links, args);
    expect(replay.duplicate).toBe(500);
    await t.run(async (ctx) => {
      expect((await ctx.db.query("sourceCounts").collect())[0].active).toBe(
        500,
      );
      expect((await ctx.db.query("reservations").collect()).length).toBe(0);
    });
  }, 30_000);
  it("imports links with a tenant-scoped manifest and no analysis charges", async () => {
    const { a, b, org } = await setup();
    const args = {
      organizationId: org,
      key: "import-001",
      format: "json" as const,
      rightsAttested: true,
      text: JSON.stringify([
        {
          url: "https://youtube.com/watch?v=one",
          title: "Synthetic imported link",
          collection: "Research",
          saved_at: "2025-01-01T00:00:00Z",
        },
        { url: "https://youtube.com/watch?v=one" },
        { url: "https://example.com/private" },
        { url: "file:///secret" },
      ]),
    };
    await expect(b.mutation(api.imports.links, args)).rejects.toThrow();
    const manifest = await a.mutation(api.imports.links, args);
    expect(manifest).toMatchObject({
      accepted: 1,
      duplicate: 1,
      unsupported: 1,
      invalid: 1,
      analysisCreditsCharged: 0,
    });
    const source = await a.query(api.product.detail, {
      id: manifest.entries[0].sourceId as any,
    });
    expect(source.originalSavedAt).toBe(Date.UTC(2025, 0, 1));
    expect(source.state).toBe("needs_upload");
    expect(source.tags).toEqual(["Research"]);
  });
  it("grants paid upgrade differences once and blocks new work on failed payment", async () => {
    const { t, a, org } = await setup();
    const start = Date.now(),
      end = start + 7 * 86400000;
    const base = {
      organizationId: org,
      subscription: "sub_synthetic",
      interval: "weekly" as const,
      start,
      end,
      verifiedPayment: true,
    };
    await t.mutation(internal.commerce.grantPeriod, {
      ...base,
      tier: "starter",
    });
    await Promise.all([
      t.mutation(internal.commerce.grantPeriod, {
        ...base,
        tier: "pro",
        upgradeAt: start + (end - start) / 2,
        invoiceId: "in_paid_synthetic",
      }),
      t.mutation(internal.commerce.grantPeriod, {
        ...base,
        tier: "pro",
        upgradeAt: start + (end - start) / 2,
        invoiceId: "in_paid_synthetic",
      }),
    ]);
    await t.run(async (ctx) => {
      const pool = (await ctx.db.query("creditPools").collect())[0];
      expect(pool.granted).toBe(107);
      expect((await ctx.db.query("billingPeriods").collect()).length).toBe(1);
    });
    await t.mutation(internal.commerce.grantPeriod, {
      ...base,
      tier: "starter",
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.query("creditPools").collect())[0].granted).toBe(
        107,
      );
    });
    await t.mutation(internal.billing.attach, {
      organizationId: org,
      customerId: "cus_synthetic",
    });
    await t.mutation(internal.billing.apply, {
      customerId: "cus_synthetic",
      status: "past_due",
      periodEnd: end,
      revision: 1,
    });
    await expect(
      t.mutation(internal.commerce.budgetFixture, {
        organizationId: org,
        key: "failed-payment-work",
        max: 1,
      }),
    ).rejects.toThrow("PAYMENT_REQUIRED");
    expect(
      (await a.query(api.product.library, { organizationId: org })).total,
    ).toBe(0);
  });
  it("preserves original transcript and invalidates old analysis after correction", async () => {
    const { t, a, b, org } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "correction-001",
      kind: "text",
      title: "Correction test",
      text: "Original evidence",
      rightsAttested: true,
    });
    await expect(
      b.mutation(api.product.editSource, {
        id,
        summary: "Edited",
        tags: [],
        correctedText: "Corrected evidence",
      }),
    ).rejects.toThrow();
    await a.mutation(api.product.editSource, {
      id,
      summary: "Edited",
      tags: [],
      correctedText: "Corrected evidence",
    });
    await t.run(async (ctx) => {
      const source = await ctx.db.get(id);
      expect(source?.originalText).toBe("Original evidence");
      expect(source?.text).toBe("Corrected evidence");
      expect(source?.generation).toBe(1);
      expect(source?.analysis).toBeUndefined();
      expect(source?.state).toBe("saved");
    });
    await a.mutation(api.product.editSource, {
      id,
      summary: "Edited again",
      tags: [],
      correctedText: "Second correction",
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.originalText).toBe("Original evidence");
    });
    await expect(
      a.mutation(api.product.editSource, {
        id,
        summary: "",
        tags: [],
        correctedText: " ",
      }),
    ).rejects.toThrow();
    for (const correctedText of [
      "-----BEGIN PRIVATE KEY-----",
      "x".repeat(60001),
    ])
      await expect(
        a.mutation(api.product.editSource, {
          id,
          summary: "",
          tags: [],
          correctedText,
        }),
      ).rejects.toThrow();
  });
  it("validates supplied schemas and rejects model privilege additions", () => {
    expect(insightOutput.safeParse(fixture).success).toBe(true);
    expect(proposalOutput.safeParse(proposalFixture).success).toBe(true);
    expect(runnerJob.safeParse(jobFixture).success).toBe(true);
    expect(
      insightOutput.safeParse({ ...fixture, execute: "steal credentials" })
        .success,
    ).toBe(false);
    expect(
      runnerJob.safeParse({ ...jobFixture, maxRuntimeSeconds: 999999 }).success,
    ).toBe(false);
  });
  it("rejects SSRF hosts, credentials, unexpected ports and URL schemes", () => {
    for (const u of [
      "http://youtube.com/a",
      "https://127.0.0.1/a",
      "https://[::1]/a",
      "https://youtube.com.evil.test/a",
      "https://youtube.com@evil.test/a",
      "https://youtube.com:8080/a",
      "file:///etc/passwd",
      "https://169.254.169.254/",
    ])
      expect(() => safeSourceUrl(u)).toThrow();
    expect(
      safeSourceUrl("https://www.youtube.com/watch?v=abc&utm_source=x"),
    ).toBe("https://www.youtube.com/watch?v=abc");
  });
  it("rejects path traversal, forbidden paths, scope changes and secret material", () => {
    for (const p of [
      "../secret",
      "/home/file",
      "a/../../x",
      "C:/secret",
      "a\\b",
    ])
      expect(safePath(p)).toBe(false);
    expect(() => validatePaths([".env"], [".env"], true)).toThrow();
    expect(() => validatePaths(["src/new.ts"], ["src/approved.ts"])).toThrow();
    expect(() =>
      validatePaths(["billing/index.ts"], ["billing/index.ts"]),
    ).toThrow();
    expect(containsSecret("-----BEGIN PRIVATE KEY-----")).toBe(true);
  });
  it("keeps source capture, direct detail, profiles, runs and usage tenant-scoped", async () => {
    const { a, b, org, other } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "capture-001",
      kind: "text",
      title: "Private source",
      text: "My original supplied transcript",
      rightsAttested: true,
    });
    for (const promise of [
      b.query(api.product.detail, { id }),
      b.query(api.product.library, { organizationId: org }),
      b.query(api.product.repositories, { organizationId: org }),
      b.query(api.product.proposals, { organizationId: org }),
      b.query(api.product.usage, { organizationId: org }),
      b.query(api.jobs.exportPage, {
        organizationId: org,
        section: "sources",
        cursor: null,
        asOf: Date.now(),
      }),
    ])
      await expect(promise).rejects.toThrow();
    expect(
      (await b.query(api.product.library, { organizationId: other })).total,
    ).toBe(0);
  });
  it("deduplicates concurrent workspace imports without cross-workspace reuse", async () => {
    const { a, b, org, other } = await setup();
    const args = {
      organizationId: org,
      key: "capture-001",
      kind: "text",
      title: "Source",
      text: "same transcript",
      rightsAttested: true,
    };
    const ids = await Promise.all([
      a.mutation(api.product.capture, args),
      a.mutation(api.product.capture, { ...args, key: "capture-002" }),
    ]);
    expect(ids[0]).toBe(ids[1]);
    const separate = await b.mutation(api.product.capture, {
      ...args,
      organizationId: other,
    });
    expect(separate).not.toBe(ids[0]);
  });
  it("limits trials and refuses unconfirmed rights or fabricated source types", async () => {
    const { a, org } = await setup();
    const base = {
      organizationId: org,
      key: "capture-001",
      kind: "text",
      title: "Source",
      text: "text",
      rightsAttested: true,
    };
    await expect(
      a.mutation(api.product.capture, { ...base, rightsAttested: false }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.product.capture, { ...base, kind: "execute" }),
    ).rejects.toThrow();
    for (let i = 0; i < 3; i++)
      await a.mutation(api.product.capture, {
        ...base,
        key: `capture-${i}`,
        text: `text${i}`,
      });
    await expect(
      a.mutation(api.product.capture, { ...base, text: "fourth" }),
    ).rejects.toThrow();
  });
  it("deletion redacts source content and records a restore tombstone", async () => {
    const { t, a, b, org } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "capture-001",
      kind: "text",
      title: "Source",
      text: "private",
      rightsAttested: true,
    });
    await expect(
      b.mutation(api.product.deleteSource, { id }),
    ).rejects.toThrow();
    await a.mutation(api.product.deleteSource, { id });
    await expect(a.query(api.product.detail, { id })).rejects.toThrow();
    expect(
      (await a.query(api.product.library, { organizationId: org })).total,
    ).toBe(0);
    await t.run(async (ctx) => {
      const source = await ctx.db.get(id);
      expect(source?.text).toBeUndefined();
      expect((await ctx.db.query("tombstones").collect())[0].target).toBe(id);
    });
  });
  it("walks restore tombstones beyond the first page and ignores a foreign tombstone target", async () => {
    const { t, a, b, org, other } = await setup();
    const source = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "restore-source",
      kind: "text",
      title: "Synthetic restored",
      text: "restored private content",
      rightsAttested: true,
    });
    const foreign = await b.mutation(api.product.capture, {
      organizationId: other,
      key: "foreign-restore",
      kind: "text",
      title: "Foreign",
      text: "must stay intact",
      rightsAttested: true,
    });
    await t.run(async (ctx) => {
      for (let n = 0; n < 7; n++)
        await ctx.db.insert("tombstones", {
          organizationId: org,
          target: "invalid-target-" + n,
          at: Date.now(),
        });
      await ctx.db.insert("tombstones", {
        organizationId: org,
        target: source,
        at: Date.now(),
      });
      await ctx.db.insert("tombstones", {
        organizationId: org,
        target: foreign,
        at: Date.now(),
      });
    });
    const first = await t.mutation(internal.privacy.retentionPage, {
      section: "tombstones",
      cursor: null,
    });
    expect(first.isDone).toBe(false);
    await t.mutation(internal.privacy.retentionPage, {
      section: "tombstones",
      cursor: first.continueCursor,
    });
    await expect(a.query(api.product.detail, { id: source })).rejects.toThrow();
    expect((await b.query(api.product.detail, { id: foreign })).text).toBe(
      "must stay intact",
    );
  });
  it("does not call a metadata link an analyzed video", async () => {
    const { a, org } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "capture-001",
      kind: "url",
      title: "Unavailable",
      url: "https://instagram.com/p/abc",
      rightsAttested: true,
    });
    const s = await a.query(api.product.detail, { id });
    expect(s.state).toBe("needs_upload");
    expect(s.coverage).toBe("metadata_only");
    expect(s.summary).toBeUndefined();
    await expect(
      a.mutation(api.product.processSource, { id, maxCredits: 10 }),
    ).rejects.toThrow();
  });
  it("distinguishes closed without merge, draft, reopened and verified merge", () => {
    expect(prState({ state: "closed", merged_at: null })).toBe(
      "closed_unmerged",
    );
    expect(prState({ state: "closed", merged_at: "2026-09-30" })).toBe(
      "merged",
    );
    expect(prState({ state: "open", draft: true })).toBe("draft");
    expect(prState({ state: "open", draft: false })).toBe("open");
  });
  it("clamps monthly anchors and does not model calendar months as four weeks", () => {
    const start = Date.UTC(2026, 0, 31, 12);
    expect(new Date(monthlyAnchor(start, 1)).toISOString()).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(new Date(monthlyAnchor(start, 2)).toISOString()).toBe(
      "2026-03-31T12:00:00.000Z",
    );
  });
  it("gates live tax and treats special registration separately from domestic VAT", () => {
    const c = {
      domestic: "pending_evidence" as const,
      special317: true,
      registrations: [],
      countries: ["RO", "DE"],
      oss: false,
      reviewed: false,
    };
    expect(() => taxTreatment(c, "RO", false, false, true)).toThrow();
    const exempt = {
      ...c,
      domestic: "ro_small_business_exempt" as const,
      reviewed: true,
      evidence: "official-record",
      effectiveAt: 1,
    };
    expect(taxTreatment(exempt, "RO", false, false, true)).toBe(
      "exempt_article_310",
    );
    expect(() => taxTreatment(exempt, "DE", false, false, true)).toThrow();
    expect(() => taxTreatment(exempt, "DE", true, false, true)).toThrow();
    expect(
      taxTreatment(
        { ...exempt, domestic: "ro_normal_vat" },
        "RO",
        false,
        false,
        true,
      ),
    ).toBe("domestic_vat");
    expect(() => taxTreatment(exempt, "US", false, false, true)).toThrow();
  });
  it("requires a reviewed business-day calendar and skips weekends", () => {
    expect(() => invoiceDeadline(Date.UTC(2026, 8, 25), [], false)).toThrow();
    expect(
      new Date(invoiceDeadline(Date.UTC(2026, 8, 25), [], true)).toISOString(),
    ).toBe("2026-10-02T00:00:00.000Z");
  });
  it("grants the verified account trial once across workspaces and keeps the source cap after deletion", async () => {
    const { a, org } = await setup();
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        await a.mutation(api.product.capture, {
          organizationId: org,
          key: `trial-source-${i}`,
          kind: "text",
          title: `Trial ${i}`,
          text: `Supplied note ${i}`,
          rightsAttested: true,
        }),
      );
    await a.mutation(api.product.deleteSource, { id: ids[0] });
    await expect(
      a.mutation(api.product.capture, {
        organizationId: org,
        key: "trial-fourth",
        kind: "text",
        title: "Fourth",
        text: "Note",
        rightsAttested: true,
      }),
    ).rejects.toThrow();
    const second = await a.mutation(api.organizations.create, {
      name: "Second workspace",
    });
    await expect(
      a.mutation(api.product.capture, {
        organizationId: second,
        key: "second-trial",
        kind: "text",
        title: "Trial again",
        text: "Note",
        rightsAttested: true,
      }),
    ).rejects.toThrow();
  });
  it("serializes concurrent credit reservations and settles a usage event once", async () => {
    const { t, org } = await setup();
    const results = await Promise.allSettled(
      ["one", "two"].map((key) =>
        t.mutation(internal.commerce.budgetFixture, {
          organizationId: org,
          key,
          max: 20,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const key = results[0].status === "fulfilled" ? "one" : "two";
    await Promise.all(
      [1, 2].map(() =>
        t.mutation(internal.commerce.settleUsage, {
          organizationId: org,
          key,
          credits: 7,
        }),
      ),
    );
    await t.run(async (ctx) => {
      const w = await ctx.db.query("wallets").first();
      expect(w?.spent).toBe(7);
      expect(w?.reserved).toBe(0);
      expect(await ctx.db.query("costEntries").collect()).toHaveLength(1);
      const budget = await ctx.db.query("operatorBudgets").collect();
      expect(budget.every((b) => b.spent === 7 && b.reserved === 0)).toBe(true);
    });
  });
  it("rejects another workspace's installation and one-time OAuth state replay", async () => {
    const { t, a, b, org, other } = await setup();
    const state = await a.mutation(api.githubLinks.begin, {
      organizationId: org,
    });
    const actor = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("users")
          .withIndex("by_subject", (q) => q.eq("subject", "a"))
          .unique())!._id,
    );
    await expect(
      t.mutation(internal.githubLinks.consume, {
        organizationId: other,
        state,
        actor,
      }),
    ).rejects.toThrow();
    await t.mutation(internal.githubLinks.consume, {
      organizationId: org,
      state,
      actor,
    });
    await expect(
      t.mutation(internal.githubLinks.consume, {
        organizationId: org,
        state,
        actor,
      }),
    ).rejects.toThrow();
    await t.mutation(internal.githubLinks.save, {
      organizationId: org,
      githubUserId: 1,
      installations: [
        {
          installationId: 11,
          repositories: [{ id: 22, fullName: "owner/repo" }],
        },
      ],
    });
    await expect(
      t.query(internal.githubLinks.binding, {
        organizationId: other,
        installationId: 11,
        providerId: 22,
        fullName: "owner/repo",
      }),
    ).rejects.toThrow();
    await expect(
      b.query(api.githubLinks.choices, { organizationId: org }),
    ).rejects.toThrow();
  });
  it("does not accept fabricated visual evidence for a supplied transcript", async () => {
    const { t, a, org } = await setup();
    const id = await a.mutation(api.product.capture, {
      organizationId: org,
      key: "evidence-1",
      kind: "text",
      title: "Text",
      text: "Actual supplied text",
      rightsAttested: true,
    });
    const output = {
      ...fixture,
      sourceId: id,
      coverage: "caption_only",
      insights: fixture.insights.map((i) => ({
        ...i,
        evidence: [
          { kind: "frame", id: "supplied_text", startMs: 0, endMs: 1 },
        ],
      })),
    };
    await expect(
      t.mutation(internal.product.commitAnalysis, {
        id,
        generation: 0,
        output,
        credits: 0,
      }),
    ).rejects.toThrow();
    expect((await a.query(api.product.detail, { id })).summary).toBeUndefined();
  });
  it("keeps durable object cleanup after workspace purge", async () => {
    const { t, org } = await setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("assets", {
        organizationId: org,
        key: `${org}/private.mp4`,
        state: "complete",
        size: 10,
        type: "video/mp4",
        expiresAt: now + 1000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(org, { status: "deleting" });
    });
    await t.mutation(internal.maintenance.purgeOrganization, {
      organizationId: org,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(org)).toBeNull();
      expect(await ctx.db.query("assets").collect()).toHaveLength(0);
      const jobs = await ctx.db.query("objectDeletions").collect();
      expect(jobs[0]?.key).toBe(`${org}/private.mp4`);
      expect(jobs[0]?.state).toBe("pending");
    });
  });
});

describe("V1 library and resource allowances", () => {
  it("pages beyond the first thirty sources and searches only the authorized workspace", async () => {
    const { t, a, org, other } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 45; i++)
        await ctx.db.insert("sources", {
          organizationId: org,
          key: `synthetic-page-${i}`,
          canonical: `synthetic-page-${i}`,
          kind: "text",
          title: `Synthetic pagination ${i}`,
          text: "test content",
          searchable: `Synthetic pagination ${i}`,
          state: "saved",
          coverage: "caption_only",
          tags: [],
          rightsAttested: true,
          generation: 0,
          createdAt: i,
          updatedAt: i,
        });
      await ctx.db.insert("sources", {
        organizationId: other,
        key: "foreign-synthetic",
        canonical: "foreign-synthetic",
        kind: "text",
        title: "foreign marker",
        searchable: "uniqueforeignmarker",
        state: "saved",
        coverage: "caption_only",
        tags: [],
        rightsAttested: true,
        generation: 0,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const first = await a.query(api.product.library, { organizationId: org });
    expect(first.items).toHaveLength(30);
    expect(first.next).toBeTruthy();
    const second = await a.query(api.product.library, {
      organizationId: org,
      cursor: first.next!,
    });
    expect(second.items).toHaveLength(15);
    expect(second.next).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((source) => source._id))
        .size,
    ).toBe(45);
    expect(
      (
        await a.query(api.product.library, {
          organizationId: org,
          search: "uniqueforeignmarker",
        })
      ).items,
    ).toHaveLength(0);
    await expect(
      a.query(api.product.library, { organizationId: org, state: "deleted" }),
    ).rejects.toThrow();
  });
  it("reserves pending upload bytes within the retained storage allowance", async () => {
    const { a, org } = await setup();
    for (let i = 0; i < 4; i++)
      await a.mutation(api.assets.grant, {
        organizationId: org,
        key: `${org}/synthetic-${i}`,
        size: 250000000,
        type: "video/mp4",
      });
    await expect(
      a.mutation(api.assets.grant, {
        organizationId: org,
        key: `${org}/synthetic-over`,
        size: 1,
        type: "video/mp4",
      }),
    ).rejects.toThrow();
  });
  it("pairs using the normal owner session and consumes approval once", async () => {
    const { t, org } = await setup();
    const stale = t.withIdentity({
      subject: "a",
      auth_time: Math.floor(Date.now() / 1000) - 301,
    });
    const args = {
      organizationId: org,
      name: "Synthetic isolated device",
      fingerprint: "a".repeat(64),
      codeHash: "b".repeat(64),
    };
    const id = await stale.mutation(api.devices.start, args);
    const approve = {
      id,
      fingerprint: args.fingerprint,
      credentialHash: "c".repeat(64),
    };
    await stale.mutation(api.devices.approve, approve);
    await expect(
      stale.mutation(api.devices.approve, approve),
    ).rejects.toThrow();
  });
});

describe("persisted matching jobs", () => {
  it("rejects concurrent duplicates, permits a bounded failed retry and reuses the committed proposal", async () => {
    const { t, a, org } = await setup();
    const sourceId = await t.run((ctx) =>
      ctx.db.insert("sources", {
        organizationId: org,
        key: "synthetic-match",
        canonical: "synthetic-match",
        kind: "text",
        title: "Synthetic matching boundary",
        text: "Synthetic permitted note",
        state: "ready",
        coverage: "caption_only",
        tags: [],
        rightsAttested: true,
        generation: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        analysis: {
          ...(insightOutput.parse(fixture) as any),
          insights: [
            ...fixture.insights,
            { ...fixture.insights[0], id: "synthetic-excluded-point" },
          ],
        },
      }),
    );
    const repositoryId = await t.mutation(internal.jobs.saveRepository, {
      organizationId: org,
      installationId: 1,
      providerId: 1,
      fullName: "test/synthetic",
      sha: "a".repeat(40),
      branch: "main",
      manifest: proposalFixture.repositoryEvidence.map((e) => e.path),
      context: "Synthetic context only",
      contextExcerpts: proposalFixture.repositoryEvidence.map((e) => ({
        path: e.path,
        startLine: 1,
        endLine: 25,
        content: Array.from(
          { length: 25 },
          () => "Synthetic fixture line",
        ).join("\n"),
        blobSha: "b".repeat(40),
      })),
    });
    await a.mutation(api.product.saveProfile, {
      id: repositoryId,
      profile: "Synthetic test repository",
      confirmed: true,
      enabled: true,
    });
    const args = { id: sourceId, repositoryId, maxCredits: 10 };
    const first = await a.mutation(api.jobs.reserveMatch, args);
    expect(first.source.analysis.insights).toHaveLength(2);
    await expect(a.mutation(api.jobs.reserveMatch, args)).rejects.toThrow();
    await t.mutation(internal.jobs.finishMatch, {
      organizationId: org,
      key: first.key,
      semanticKey: first.semanticKey,
      credits: 0,
    });
    const retry = await a.mutation(api.jobs.reserveMatch, args);
    expect(retry.key).not.toBe(first.key);
    const detail = {
      ...proposalFixture,
      repositoryId,
      baseSha: "a".repeat(40),
      profileVersion: 2,
      insightIds: fixture.insights.map((i) => i.id),
      sourceEvidence: fixture.insights.flatMap((i) => i.evidence),
    };
    for (const repositoryEvidence of [
      [{ ...detail.repositoryEvidence[0], endLine: 999999 }],
      [{ ...detail.repositoryEvidence[0], startLine: 24, endLine: 22 }],
      [{ ...detail.repositoryEvidence[0], path: "unread-in-manifest.ts" }],
    ])
      await expect(
        t.mutation(internal.product.addProposal, {
          sourceId,
          repositoryId,
          detail: { ...detail, repositoryEvidence },
          matchKey: retry.semanticKey,
          sourceGeneration: 1,
        }),
      ).rejects.toThrow();
    const proposalId = await t.mutation(internal.product.addProposal, {
      sourceId,
      repositoryId,
      detail,
      matchKey: retry.semanticKey,
      sourceGeneration: 1,
    });
    expect(
      await t.mutation(internal.product.addProposal, {
        sourceId,
        repositoryId,
        detail,
        matchKey: retry.semanticKey,
        sourceGeneration: 1,
      }),
    ).toBe(proposalId);
    await t.mutation(internal.jobs.finishMatch, {
      organizationId: org,
      key: retry.key,
      semanticKey: retry.semanticKey,
      credits: 0,
      proposalId: proposalId!,
    });
    expect((await a.mutation(api.jobs.reserveMatch, args)).cached).toBe(true);
    const subset = await a.mutation(api.jobs.reserveMatch, {
      ...args,
      insightIds: ["synthetic-excluded-point"],
    });
    expect(subset.semanticKey).not.toBe(first.semanticKey);
    expect(subset.source.analysis.insights.map((i: any) => i.id)).toEqual([
      "synthetic-excluded-point",
    ]);
    await expect(
      t.mutation(internal.product.addProposal, {
        sourceId,
        repositoryId,
        detail,
        matchKey: subset.semanticKey,
        sourceGeneration: 1,
      }),
    ).rejects.toThrow("INVALID_EVIDENCE");
    await t.mutation(internal.jobs.finishMatch, {
      organizationId: org,
      key: subset.key,
      semanticKey: subset.semanticKey,
      credits: 0,
    });

    await t.run(async (ctx) => {
      const proposal = await ctx.db.get(proposalId!);
      await ctx.db.patch(proposalId!, {
        disposition: "no_fit",
        detail: { ...proposal!.detail, disposition: "no_fit" },
      });
    });
    await expect(
      a.mutation(api.product.decide, {
        id: proposalId!,
        version: 1,
        decision: "accepted",
        note: "",
      }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.product.decide, {
        id: proposalId!,
        version: 1,
        decision: "accepted",
        disposition: "relevant",
        note: "",
      }),
    ).rejects.toThrow();
    await a.mutation(api.product.decide, {
      id: proposalId!,
      version: 1,
      decision: "accepted",
      disposition: "relevant",
      note: "The reviewer checked the repository and the proposed document is absent.",
    });
    const corrected = await t.run((ctx) => ctx.db.get(proposalId!));
    expect(corrected!.version).toBe(2);
    expect(corrected!.detail.disposition).toBe("no_fit");
    expect(corrected!.reviewerCorrection!.from).toBe("no_fit");
    expect(corrected!.disposition).toBe("relevant");
    await expect(
      a.mutation(api.product.decide, {
        id: proposalId!,
        version: 1,
        decision: "accepted",
        note: "",
      }),
    ).rejects.toThrow();

    expect(
      await t.run((ctx) => ctx.db.query("proposals").collect()),
    ).toHaveLength(1);
  });
});

describe("verified media evidence", () => {
  it("rejects foreign frames, stale generations and invented timing before committing a funded analysis", async () => {
    const { t, a, b, org, other } = await setup();
    const create = (organizationId: typeof org) =>
      t.run((ctx) =>
        ctx.db.insert("sources", {
          organizationId,
          key: crypto.randomUUID(),
          canonical: crypto.randomUUID(),
          kind: "upload",
          title: "Synthetic media test",
          state: "queued",
          coverage: "metadata_only",
          tags: [],
          rightsAttested: true,
          generation: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
    const sourceId = await create(org),
      foreignSource = await create(other);
    const frame = await t.mutation(internal.assets.registerEvidence, {
      sourceId,
      generation: 1,
      key: `${org}/synthetic-frame`,
      size: 32,
      etag: "synthetic",
    });
    const foreign = await t.mutation(internal.assets.registerEvidence, {
      sourceId: foreignSource,
      generation: 1,
      key: `${other}/synthetic-frame`,
      size: 32,
      etag: "synthetic",
    });
    await expect(
      b.query(api.assets.evidence, { id: frame! }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.product.stageMedia, {
        id: sourceId,
        generation: 1,
        transcript: "",
        coverage: "visual_only",
        evidence: [{ kind: "frame", id: foreign!, startMs: 0, endMs: 0 }],
      }),
    ).rejects.toThrow();
    expect(
      await t.mutation(internal.product.stageMedia, {
        id: sourceId,
        generation: 0,
        transcript: "",
        coverage: "visual_only",
        evidence: [],
      }),
    ).toBe(false);
    await t.mutation(internal.product.stageMedia, {
      id: sourceId,
      generation: 1,
      transcript: "",
      coverage: "visual_only",
      evidence: [{ kind: "frame", id: frame!, startMs: 100, endMs: 100 }],
    });
    await t.run((ctx) => reserve(ctx, org, `source:${sourceId}:1`, 10));
    const output = {
      ...fixture,
      sourceId,
      processingRunId: `${sourceId}:1`,
      coverage: "visual_only",
      insights: fixture.insights.map((i) => ({
        ...i,
        evidence: [{ kind: "frame", id: frame!, startMs: 999, endMs: 999 }],
      })),
    };
    await expect(
      t.mutation(internal.product.commitAnalysis, {
        id: sourceId,
        generation: 1,
        output,
        credits: 0,
      }),
    ).rejects.toThrow();
    output.insights = output.insights.map((i) => ({
      ...i,
      evidence: [{ kind: "frame", id: frame!, startMs: 100, endMs: 100 }],
    }));
    await t.mutation(internal.product.commitAnalysis, {
      id: sourceId,
      generation: 1,
      output,
      credits: 0,
    });
    expect((await a.query(api.product.detail, { id: sourceId })).coverage).toBe(
      "visual_only",
    );
    await a.mutation(api.product.deleteSource, { id: sourceId });
    await expect(
      a.query(api.assets.evidence, { id: frame! }),
    ).rejects.toThrow();
  });
});
