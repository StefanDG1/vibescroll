import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { prepared } from "./chat-proposal-fixture";
import { createHmac } from "node:crypto";
import { proposalIssueLocator } from "../packages/contracts/proposal-work";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function handoffFixture() {
  const f = await prepared();
  const proposal = await f.save();
  const input = {
    proposalId: proposal.proposalId,
    expectedVersion: proposal.version,
    expectedReview: proposal.review,
    contextHash: proposal.contextHash,
    key: "prepare-project-issue-one",
  };
  const prepare = (args = input) =>
    f.assistant.mutation(internal.assistantProposalWork.prepare, args);
  const handoff = (await prepare()).handoff;
  const reportInput = {
    proposalId: proposal.proposalId,
    handoffId: handoff.id,
    key: "implementer-report-one",
    status: "completed",
    summary:
      "Inspected the repository; no code change was needed. No tests were run.",
    workUrls: ["https://github.com/owned/synthetic/issues/42"],
    commitSha: null,
  };
  return {
    ...f,
    proposal,
    input,
    prepare,
    handoff,
    reportInput,
    saveInput: f.input,
    report: (args = reportInput) =>
      f.assistant.mutation(internal.assistantProposalWork.report, args),
  };
}

it("freezes a secret-free handoff with authenticated callback instructions and no publication or execution", async () => {
  const f = await handoffFixture();
  expect(f.handoff.body).toContain(
    `<!-- vibescroll-handoff:${f.handoff.id} -->`,
  );
  expect(f.handoff.body).toContain("report_project_outcome");
  expect(f.handoff.body).toContain("does not authorize coding");
  expect(f.handoff.body).not.toContain("PRIVATE REPOSITORY CODE MUST STAY OUT");
  expect(f.handoff.body).not.toContain("/api/evidence/");
  const [a, b] = await Promise.all([f.prepare(), f.prepare()]);
  expect(a.handoff.id).toBe(b.handoff.id);
  expect(a).toMatchObject({
    replayed: true,
    publicationStarted: false,
    codingAuthorized: false,
    creditsSpent: 0,
  });
  expect(await f.t.run((ctx) => ctx.db.query("issueAttempts").take(1))).toEqual(
    [],
  );
  expect(await f.t.run((ctx) => ctx.db.query("runs").take(1))).toEqual([]);
  await expect(
    f.prepare({ ...f.input, key: "create-a-second-issue" }),
  ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
});

it("replays an exact report without turning a model claim into CI, merge, review or benefit evidence", async () => {
  const f = await handoffFixture();
  const network = vi.fn(() => {
    throw Error("No provider call");
  });
  vi.stubGlobal("fetch", network);
  const [one, two] = await Promise.all([f.report(), f.report()]);
  expect(one.report.hash).toBe(two.report.hash);
  expect(one).toMatchObject({
    verifiedCompletion: false,
    verifiedMerge: false,
    verifiedBenefit: false,
  });
  const saved = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: f.proposal.proposalId,
  });
  expect(saved).toMatchObject({
    version: 1,
    review: "unreviewed",
    codingAuthorized: false,
    creditsSpent: 0,
  });
  if (!saved.handoff) throw Error("Expected saved handoff");
  expect(saved.handoff.reports).toHaveLength(1);
  expect(saved.handoff.reports[0].provenance).toBe(
    "authenticated_model_report",
  );
  expect(network).not.toHaveBeenCalled();
  await expect(
    f.report({ ...f.reportInput, summary: "Different result" }),
  ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
});

it("preserves the frozen issue and concurrent report across an ordinary proposal edit", async () => {
  const f = await handoffFixture();
  await Promise.all([
    f.report(),
    f.assistant.mutation(internal.assistantProposals.save, {
      ...f.saveInput,
      proposalId: f.proposal.proposalId,
      expectedVersion: 1,
      expectedReview: "unreviewed",
      key: "refine-after-handoff-one",
      body: { ...f.saveInput.body, title: "Refined after the handoff" },
    }),
  ]);
  const saved = await f.assistant.query(internal.assistantProposals.read, {
    proposalId: f.proposal.proposalId,
  });
  if (!saved.handoff) throw Error("Expected retained handoff");
  expect(saved.version).toBe(2);
  expect(saved.handoff.id).toBe(f.handoff.id);
  expect(saved.handoff.body).toBe(f.handoff.body);
  expect(saved.handoff.proposalVersion).toBe(1);
  if (!saved.handoff) throw Error("Expected saved handoff");
  expect(saved.handoff.reports).toHaveLength(1);
  expect((await f.prepare()).handoff.body).toBe(f.handoff.body);
});

it("rejects foreign, credential-bearing and non-issue work links", async () => {
  const f = await handoffFixture();
  for (const url of [
    "https://github.com/other/project/issues/42",
    "https://github.com/owned/synthetic/issues/42?token=secret",
    "https://name:password@github.com/owned/synthetic/issues/42",
    "https://github.com/owned/synthetic/commit/" + "a".repeat(40),
    "https://github.com/owned/synthetic/pull/0",
  ])
    await expect(
      f.report({ ...f.reportInput, workUrls: [url] }),
    ).rejects.toThrow(/INVALID_INPUT/);
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.proposal.proposalId)))?.detail.handoff
      .reports,
  ).toHaveLength(0);
});

it("expires new reports independently from retained evidence and preserves known report replay", async () => {
  const f = await handoffFixture();
  await f.t.run(async (ctx) => {
    const p = (await ctx.db.get(f.proposal.proposalId))!;
    await ctx.db.patch(p._id, {
      detail: {
        ...p.detail,
        handoff: { ...p.detail.handoff, expiresAt: Date.now() + 3600000 },
      },
    });
  });
  await f.report();
  vi.advanceTimersByTime(2 * 3600000);
  expect((await f.report()).replayed).toBe(true);
  await expect(
    f.report({ ...f.reportInput, key: "later-report-after-expiry" }),
  ).rejects.toThrow(/APPROVAL_STALE/);
  expect(
    (
      await f.assistant.query(internal.assistantProposals.read, {
        proposalId: f.proposal.proposalId,
      })
    ).handoff?.body,
  ).toBe(f.handoff.body);
});

it("requires the actual feedback scope and current source/project grant even for report replay", async () => {
  const f = await handoffFixture();
  const reader = f.t.withIdentity({
    ...f.identity,
    scope: f.identity.scope.replace("feedback:write", ""),
  });
  await expect(
    reader.mutation(internal.assistantProposalWork.report, f.reportInput),
  ).rejects.toThrow(/FORBIDDEN/);
  await f.report();
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version,
  });
  await expect(f.report()).rejects.toThrow(/FORBIDDEN/);
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.proposal.proposalId)))?.detail.handoff
      .reports,
  ).toHaveLength(1);
});

it("never accepts a handoff ID from another proposal or credentials in the report summary", async () => {
  const f = await handoffFixture();
  await expect(
    f.report({ ...f.reportInput, handoffId: "work_another_handoff" }),
  ).rejects.toThrow(/FORBIDDEN/);
  await expect(
    f.report({
      ...f.reportInput,
      summary: "Open /api/evidence/private?token=abc",
    }),
  ).rejects.toThrow(/POLICY_BLOCKED/);
});

it("refuses a stale handoff preparation and source disclosure after access is removed", async () => {
  const f = await prepared();
  const proposal = await f.save();
  const args = {
    proposalId: proposal.proposalId,
    expectedVersion: 2,
    expectedReview: "unreviewed",
    contextHash: proposal.contextHash,
    key: "stale-handoff-attempt",
  };
  await expect(
    f.assistant.mutation(internal.assistantProposalWork.prepare, args),
  ).rejects.toThrow(/APPROVAL_STALE/);
  const current = await handoffFixture();
  await current.t.run(async (ctx) => {
    const source = (await ctx.db.get(current.sourceId))!;
    await ctx.db.patch(source._id, { state: "deleted" });
  });
  await expect(current.report()).rejects.toThrow(
    /FORBIDDEN|SOURCE_UNAVAILABLE/,
  );
  expect(
    (await current.t.run((ctx) => ctx.db.get(current.proposal.proposalId)))
      ?.detail.handoff.reports,
  ).toHaveLength(0);
});

it("accepts a frozen-task report after HEAD advances without authorizing planning against the new snapshot", async () => {
  const f = await handoffFixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.projectId, { sha: "b".repeat(40), profileVersion: 2 }),
  );
  const result = await f.report();
  expect(result).toMatchObject({
    verifiedCompletion: false,
    verifiedCi: false,
    verifiedMerge: false,
  });
  const stored = (await f.t.run((ctx) => ctx.db.get(f.proposal.proposalId)))!;
  expect(stored.baseSha).toBe("a".repeat(40));
  expect(stored.detail.handoff.baseSha).toBe("a".repeat(40));
  expect(stored.detail.handoff.reports).toHaveLength(1);
  await expect(f.prepare()).rejects.toThrow(/APPROVAL_STALE/);
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { enabled: false }));
  await expect(f.report()).rejects.toThrow(/FORBIDDEN/);
});

async function issueEventFixture() {
  const f = await handoffFixture();
  const event = {
    installationId: 42,
    providerId: 55,
    repository: "owned/synthetic",
    issueId: 1234,
    number: 42,
    url: "https://github.com/owned/synthetic/issues/42",
    title: f.handoff.title,
    body: f.handoff.body,
    state: "open",
    updatedAt: Math.floor(Date.now() / 1000) * 1000,
  };
  const observe = (args = event) =>
    f.t.mutation(internal.assistantProposalWork.observeIssue, args);
  const read = async () =>
    (await f.t.run((ctx) => ctx.db.get(f.proposal.proposalId)))!;
  return { ...f, event, observe, stored: read };
}

it("binds a signed issue to the exact frozen handoff, preserves reports and records closed separately from completion", async () => {
  const f = await issueEventFixture();
  await f.report();
  const before = await f.stored();
  expect(await f.observe()).toBe(true);
  expect(await f.observe()).toBe(false);
  vi.advanceTimersByTime(2000);
  expect(
    await f.observe({
      ...f.event,
      state: "closed",
      updatedAt: f.event.updatedAt + 2000,
    }),
  ).toBe(true);
  const after = await f.stored();
  expect(after).toMatchObject({
    version: before.version,
    review: before.review,
  });
  expect(after.detail.handoff.reports).toEqual(before.detail.handoff.reports);
  expect(after.detail.handoff.githubIssue).toMatchObject({
    provenance: "signed_github_webhook",
    number: 42,
    state: "closed",
    bodyMatchesFrozen: true,
  });
  expect(after.detail.handoff.githubIssue).not.toHaveProperty(
    "verifiedCompletion",
  );
  expect(
    (
      await f.assistant.query(internal.assistantProposals.read, {
        proposalId: f.proposal.proposalId,
      })
    ).handoff?.githubIssue?.state,
  ).toBe("closed");
  expect(await f.t.run((ctx) => ctx.db.query("runs").take(1))).toEqual([]);
  expect(await f.t.run((ctx) => ctx.db.query("issueAttempts").take(1))).toEqual(
    [],
  );
});

it("rejects copied markers, foreign repositories, malformed IDs, rebinds and stale or ambiguous issue ordering", async () => {
  const f = await issueEventFixture();
  for (const patch of [
    { body: f.event.body + "\nDifferent issue" },
    { title: "Other issue" },
    { installationId: 99 },
    { providerId: 99 },
    { repository: "foreign/synthetic" },
    { url: "https://github.com/foreign/synthetic/issues/42" },
    { body: f.event.body.replace(f.proposal.proposalId, "notavalidconvexid") },
    { updatedAt: Date.now() + 86400000 },
  ])
    expect(await f.observe({ ...f.event, ...patch })).toBe(false);
  expect(await f.observe()).toBe(true);
  expect(await f.observe({ ...f.event, issueId: 999 })).toBe(false);
  expect(
    await f.observe({
      ...f.event,
      number: 43,
      url: "https://github.com/owned/synthetic/issues/43",
    }),
  ).toBe(false);
  expect(
    await f.observe({ ...f.event, updatedAt: f.event.updatedAt - 1000 }),
  ).toBe(false);
  expect(await f.observe({ ...f.event, state: "closed" })).toBe(true);
  expect((await f.stored()).detail.handoff.githubIssue.state).toBe("unknown");
  expect(await f.observe()).toBe(false);
  vi.advanceTimersByTime(2000);
  expect(
    await f.observe({ ...f.event, updatedAt: f.event.updatedAt + 2000 }),
  ).toBe(true);
  expect((await f.stored()).detail.handoff.githubIssue.state).toBe("open");
  expect(
    proposalIssueLocator(
      f.event.body + `\n<!-- vibescroll-handoff:${f.handoff.id} -->`,
    ),
  ).toBeNull();
});

it("retains provider observations and concurrent proposal edits/reports without following changed source authority", async () => {
  const f = await issueEventFixture();
  await Promise.all([
    f.observe(),
    f.report(),
    f.assistant.mutation(internal.assistantProposals.save, {
      ...f.saveInput,
      proposalId: f.proposal.proposalId,
      expectedVersion: 1,
      expectedReview: "unreviewed",
      key: "edit-while-issue-arrives",
      body: { ...f.saveInput.body, title: "Refined proposal title" },
    }),
  ]);
  let p = await f.stored();
  expect(p.version).toBe(2);
  expect(p.detail.title).toBe("Refined proposal title");
  expect(p.detail.handoff.reports).toHaveLength(1);
  expect(p.detail.handoff.githubIssue.state).toBe("open");
  vi.advanceTimersByTime(2000);
  await f.observe({
    ...f.event,
    body: f.event.body + "\nEdited on GitHub",
    updatedAt: f.event.updatedAt + 2000,
  });
  p = await f.stored();
  expect(p.detail.handoff.githubIssue.bodyMatchesFrozen).toBe(false);
  expect(p.detail.handoff.body).toBe(f.handoff.body);
  await f.t.run((ctx) => ctx.db.patch(f.sourceId, { state: "deleted" }));
  expect(
    await f.observe({
      ...f.event,
      state: "closed",
      updatedAt: f.event.updatedAt + 3000,
    }),
  ).toBe(false);
  await expect(
    f.assistant.query(internal.assistantProposals.read, {
      proposalId: f.proposal.proposalId,
    }),
  ).rejects.toThrow(/FORBIDDEN|SOURCE_UNAVAILABLE/);
});

it("authenticates the actual GitHub webhook before observing a proposal issue and preserves the restore lock", async () => {
  const f = await issueEventFixture();
  const secret = "synthetic-webhook-test-only";
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", secret);
  const body = JSON.stringify({
    action: "opened",
    installation: { id: 42 },
    repository: { id: 55, full_name: "owned/synthetic" },
    issue: {
      id: 1234,
      number: 42,
      html_url: f.event.url,
      title: f.event.title,
      body: f.event.body,
      state: "open",
      updated_at: new Date(f.event.updatedAt).toISOString(),
    },
  });
  const input = {
    body,
    delivery: "synthetic-delivery-0123456789",
    signature: "sha256=" + "0".repeat(64),
  };
  expect(await f.t.action(internal.githubEvents.webhook, input)).toMatchObject({
    status: 400,
    category: "SIGNATURE_INVALID",
  });
  expect((await f.stored()).detail.handoff.githubIssue).toBeUndefined();
  input.signature =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  expect(await f.t.action(internal.githubEvents.webhook, input)).toEqual({
    status: 200,
  });
  expect((await f.stored()).detail.handoff.githubIssue.state).toBe("open");
  vi.stubEnv("RESTORE_LOCK", "true");
  expect(await f.t.action(internal.githubEvents.webhook, input)).toMatchObject({
    status: 503,
  });
});
