import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import {
  chatProposalBody,
  chatProposalListSummary,
  listProjectProposalsInput,
} from "../packages/contracts/chat-proposals";
import { prepared, clientId, scopes } from "./chat-proposal-fixture";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("lists authorized summaries without projecting bodies or returning handoff/context payloads and preserves full defaults", async () => {
  const f = await prepared();
  const proposal = await f.save();
  await f.assistant.mutation(internal.assistantProposalWork.prepare, {
    proposalId: proposal.proposalId,
    expectedVersion: proposal.version,
    expectedReview: proposal.review,
    contextHash: proposal.contextHash,
    key: "prepare-summary-list-handoff",
  });
  const full = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
  });
  expect(
    await f.assistant.query(internal.assistantProposals.list, {
      profileId: f.org,
      detail: "full",
    }),
  ).toEqual(full);
  expect(full.items[0].handoff?.body).toContain("vibescroll-handoff");
  const projectBody = vi.spyOn(chatProposalBody, "parse");
  const summary = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    detail: "summary",
  });
  expect(projectBody).not.toHaveBeenCalled();
  expect(summary.items).toHaveLength(1);
  expect(chatProposalListSummary.parse(summary.items[0])).toMatchObject({
    proposalId: proposal.proposalId,
    title: proposal.body.title,
    current: true,
    version: 1,
    codingAuthorized: false,
    publicationAuthorized: false,
  });
  const {
    handoff: _handoff,
    contextHash: _contextHash,
    ...metadata
  } = full.items[0];
  expect(summary.items[0]).toEqual(metadata);
  for (const key of ["body", "handoff", "contextHash", "context", "_chat"])
    expect(summary.items[0]).not.toHaveProperty(key);
  expect(JSON.stringify(summary)).not.toContain("PRIVATE REPOSITORY CODE");
  expect(JSON.stringify(summary)).not.toContain(
    "A software product with testing",
  );
  expect(
    new TextEncoder().encode(JSON.stringify(summary)).byteLength,
  ).toBeLessThan(new TextEncoder().encode(JSON.stringify(full)).byteLength);
  expect(listProjectProposalsInput.parse({ detail: "summary" })).toEqual({
    detail: "summary",
  });
  expect(listProjectProposalsInput.safeParse({ detail: "other" }).success).toBe(
    false,
  );
});

it("keeps summary and full authorization/freshness decisions equal for changed projects, evidence and revoked grants", async () => {
  const f = await prepared();
  const proposal = await f.save();
  const list = (detail: "summary" | "full") =>
    f.assistant.query(internal.assistantProposals.list, {
      profileId: f.org,
      detail,
    });
  await f.t.run((ctx) =>
    ctx.db.patch(proposal.proposalId, { baseSha: "b".repeat(40) }),
  );
  for (const detail of ["summary", "full"] as const) {
    const staleBinding = await list(detail);
    expect(staleBinding.items).toHaveLength(1);
    expect(staleBinding.items[0].current).toBe(false);
  }
  await f.t.run((ctx) =>
    ctx.db.patch(proposal.proposalId, { baseSha: "a".repeat(40) }),
  );
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { profileVersion: 2 }));
  for (const detail of ["summary", "full"] as const)
    expect((await list(detail)).items).toEqual([]);
  await f.t.run((ctx) => ctx.db.patch(f.projectId, { profileVersion: 1 }));
  await f.t.run(async (ctx) => {
    const row = (await ctx.db.get(proposal.proposalId))!;
    await ctx.db.patch(row._id, {
      detail: {
        ...row.detail,
        _chat: {
          ...row.detail._chat,
          binding: {
            ...row.detail._chat.binding,
            evidenceHash: "f".repeat(64),
          },
        },
      },
    });
  });
  for (const detail of ["summary", "full"] as const)
    expect((await list(detail)).items).toEqual([]);
  await f.owner.mutation(api.assistantGrants.revoke, {
    id: f.grant.id,
    expectedVersion: f.grant.version,
  });
  for (const detail of ["summary", "full"] as const)
    await expect(list(detail)).rejects.toThrow("FORBIDDEN");
});

async function pagedFixture() {
  const f = await prepared();
  const saved = await f.save();
  await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(saved.proposalId))!;
    const { _id: _proposalId, _creationTime: _created, ...proposal } = original;
    for (let index = 0; index < 12; index++)
      await ctx.db.insert("proposals", {
        ...proposal,
        title: `Proposal ${index}`,
      });
  });
  return { ...f, saved };
}

it("pages summary results without overlap and binds cursors to the grant, filter and requested detail", async () => {
  const f = await pagedFixture();
  const first = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    detail: "summary",
  });
  expect(first).toMatchObject({
    examined: 10,
    has_more: true,
    exhausted: false,
  });
  expect(first.items).toHaveLength(10);
  const second = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    detail: "summary",
    cursor: first.next_cursor!,
  });
  expect(second).toMatchObject({
    examined: 3,
    has_more: false,
    exhausted: true,
    next_cursor: null,
  });
  expect(second.items).toHaveLength(3);
  const ids = [...first.items, ...second.items].map(
    (item: { proposalId: string }) => item.proposalId,
  );
  expect(new Set(ids).size).toBe(13);
  for (const changed of [
    { projectId: f.projectId },
    { detail: "full" as const },
  ])
    await expect(
      f.assistant.query(internal.assistantProposals.list, {
        profileId: f.org,
        detail: "summary",
        cursor: first.next_cursor!,
        ...changed,
      }),
    ).rejects.toThrow("STALE_APPROVAL");
  const full = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
  });
  expect(
    (
      await f.assistant.query(internal.assistantProposals.list, {
        profileId: f.org,
        cursor: full.next_cursor!,
      })
    ).items,
  ).toHaveLength(3);
  await expect(
    f.assistant.query(internal.assistantProposals.list, {
      profileId: f.org,
      detail: "summary",
      cursor: full.next_cursor!,
    }),
  ).rejects.toThrow("INVALID_INPUT");
  await f.t.run((ctx) =>
    ctx.db.patch(f.grant.id, { version: f.grant.version + 1 }),
  );
  await expect(
    f.assistant.query(internal.assistantProposals.list, {
      profileId: f.org,
      detail: "summary",
      cursor: first.next_cursor!,
    }),
  ).rejects.toThrow("STALE_APPROVAL");
});

it("returns continuation and exhaustion for empty filtered pages", async () => {
  const f = await prepared();
  const saved = await f.save();
  await f.t.run(async (ctx) => {
    const {
      _id: _repoId,
      _creationTime: _repoTime,
      ...repository
    } = (await ctx.db.get(f.projectId))!;
    const otherProject = await ctx.db.insert("repositories", {
      ...repository,
      providerId: 56,
      fullName: "owned/other",
    });
    const {
      _id: _proposalId,
      _creationTime: _proposalTime,
      ...proposal
    } = (await ctx.db.get(saved.proposalId))!;
    for (let index = 0; index < 10; index++)
      await ctx.db.insert("proposals", {
        ...proposal,
        repositoryId: otherProject,
        detail: { ...proposal.detail, repositoryId: otherProject },
      });
  });
  const first = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    projectId: f.projectId,
    detail: "summary",
  });
  expect(first).toMatchObject({
    items: [],
    examined: 10,
    has_more: true,
    exhausted: false,
  });
  expect(first.next_cursor).toBeTruthy();
  const final = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    projectId: f.projectId,
    detail: "summary",
    cursor: first.next_cursor!,
  });
  expect(final).toMatchObject({
    examined: 1,
    has_more: false,
    exhausted: true,
    next_cursor: null,
  });
  expect(
    final.items.map((item: { proposalId: string }) => item.proposalId),
  ).toEqual([saved.proposalId]);
});

it("rejects another authorized actor or client's summary cursor while retaining their independent access", async () => {
  const f = await pagedFixture();
  const first = await f.assistant.query(internal.assistantProposals.list, {
    profileId: f.org,
    detail: "summary",
  });
  const otherSubject = "user_98765432109876543210987654";
  const otherClient = "client_98765432109876543210987654";
  await f.t.mutation(internal.accounts.syncUser, {
    subject: otherSubject,
    email: "other@example.test",
    name: "Other reader",
  });
  await f.t.run(async (ctx) => {
    // Model a legacy shared workspace with explicit independent memberships.
    await ctx.db.patch(f.org, { privateOwnerId: undefined });
    const actor = (await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", otherSubject))
      .unique())!;
    await ctx.db.insert("memberships", {
      organizationId: f.org,
      userId: actor._id,
      role: "member",
    });
    const {
      _id: _grantId,
      _creationTime: _grantTime,
      ...grant
    } = (await ctx.db.get(f.grant.id))!;
    await ctx.db.insert("assistantGrants", { ...grant, actor: actor._id });
    await ctx.db.insert("assistantGrants", { ...grant, clientId: otherClient });
  });
  vi.stubEnv(
    "MCP_CLIENTS",
    JSON.stringify([
      { id: clientId, name: "Original", scopes },
      { id: otherClient, name: "Other", scopes },
    ]),
  );
  for (const identity of [
    { ...f.identity, subject: otherSubject },
    { ...f.identity, client_id: otherClient },
  ]) {
    const caller = f.t.withIdentity(identity);
    expect(
      (
        await caller.query(internal.assistantProposals.list, {
          profileId: f.org,
          detail: "summary",
        })
      ).items,
    ).toHaveLength(10);
    await expect(
      caller.query(internal.assistantProposals.list, {
        profileId: f.org,
        detail: "summary",
        cursor: first.next_cursor!,
      }),
    ).rejects.toThrow("STALE_APPROVAL");
  }
});
