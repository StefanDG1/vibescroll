import { query, internalQuery, type QueryCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { access, writeAccess, audit, limit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { digest } from "./product";
import { internal } from "./_generated/api";
import { issueApproval } from "../packages/knowledge/contracts";
import { knowledgeReadContext } from "./lib/knowledgeReadContext";
import { samePrivateEvaluationOrigin } from "./lib/privateEvaluationContext";
import {
  evaluationCurrent,
  actorCurrent,
  referencesCurrent,
} from "./knowledge";
const publicationEnabled = () =>
  process.env.RESTORE_LOCK !== "true" && process.env.DISABLE_ISSUES !== "true";
const markerFor = (id: string) => `<!-- vibescroller-issue:${id} -->`;
export async function draftCurrent(ctx: QueryCtx, d: Doc<"issueDrafts">) {
  const e = await ctx.db.get(d.evaluationId);
  return (
    !!e &&
    samePrivateEvaluationOrigin(
      e.privateEvaluationOrigin,
      d.privateEvaluationOrigin,
    ) &&
    (await evaluationCurrent(ctx, e)) &&
    (await referencesCurrent(ctx, d.organizationId, d.references)) &&
    e.topicVersion === d.topicVersion &&
    e.baseSha === d.baseSha &&
    e.profileVersion === d.profileVersion
  );
}
function safeDraft(
  title: string,
  body: string,
  marker: string,
  sensitive: boolean,
) {
  ensure(
    title.trim().length > 0 &&
      title.length <= 180 &&
      body.trim().length > 0 &&
      body.length <= 20000,
    "INVALID_INPUT",
    "Issue title/body exceed their limits.",
  );
  ensure(
    body.includes(marker) && body.split(marker).length === 2,
    "INVALID_INPUT",
    "Keep the issue's recovery marker exactly once.",
  );
  ensure(
    !containsSecret(`${title}\n${body}`) &&
      !/(?:X-Amz-|X-Goog-|[?&](?:token|sig|signature|key)=|\/api\/evidence\/)/i.test(
        body,
      ),
    "POLICY_BLOCKED",
    "Do not publish credentials or private storage links.",
  );
  ensure(
    sensitive || !/```|data:image|<img\b|!\[.*?\]\(/i.test(body),
    "RIGHTS_REQUIRED",
    "Code or media excerpts need a separate rights and inclusion choice.",
  );
}
export async function createIssueCore(
  ctx: import("./_generated/server").MutationCtx,
  a: {
    id: import("./_generated/dataModel").Id<"knowledgeEvaluations">;
    followUp: boolean;
  },
  authorizedActor?: Doc<"users">,
) {
  const e = await ctx.db.get(a.id);
  ensure(
    e && e.state === "ready" && e.output && (await evaluationCurrent(ctx, e)),
    "APPROVAL_STALE",
    "Evaluate current evidence before drafting an issue.",
  );
  if (!authorizedActor) await writeAccess(ctx, e.organizationId);
  else
    ensure(
      await actorCurrent(ctx, e.organizationId, authorizedActor._id, [
        "owner",
        "admin",
      ]),
      "FORBIDDEN",
      "Workspace access changed.",
    );
  await limit(ctx, `issue-draft:${e.organizationId}`, 20);
  const prior = await ctx.db
    .query("issueDrafts")
    .withIndex("by_evaluation", (q) => q.eq("evaluationId", e._id))
    .take(2);
  ensure(
    !prior.length || a.followUp,
    "DUPLICATE_ISSUE",
    "This idea already has an issue draft. Open it, or explicitly review a follow-up.",
  );
  const repo = (await ctx.db.get(e.repositoryId))!,
    output = e.output;
  const marker = markerFor(crypto.randomUUID());
  const bullets = (rows: string[]) =>
    rows.length
      ? rows.map((r) => `- ${r}`).join("\n")
      : "- No additional item established.";
  const origin = process.env.SITE_URL ?? "https://scroll.companynerve.com";
  const refs = output.references
    .map(
      (r: any) =>
        `- [Private source evidence](${origin}/app/${e.organizationId}/library/${r.sourceId}), insight ${r.insightId}. Requires workspace membership.`,
    )
    .join("\n");
  const repoEvidence =
    output.repositoryEvidence
      .map(
        (r: any) =>
          `- ${r.path}:${r.startLine}-${r.endLine} at ${e.baseSha}: ${r.explanation}`,
      )
      .join("\n") ||
    "File locations are unknown or this is a manual/research task.";
  const snapshotCoverage = repo.snapshotPaths?.length
    ? ` Explicit snapshot selection: ${repo.snapshotPaths.length} file/folder paths; ${repo.snapshotSummary?.omittedEligibleFileCount ?? "unknown"} eligible repository files omitted. The whole repository was not reviewed.`
    : " Only bounded repository excerpts were inspected.";
  const body = `## Problem and context\n\n${output.problem}\n\n## Why this fits ${repo.fullName}\n\n${output.rationale}\n\n## Source insights\n\n${refs}\n\n## Repository evidence\n\n${repoEvidence}\n\n## Suggested approach\n\n${output.approach}\n\n## Acceptance criteria\n\n${bullets(output.acceptance)}\n\n## Tests\n\n${bullets(output.tests)}\n\n## Risks\n\n${bullets(output.risks)}\n\n## Alternatives\n\n${bullets(output.alternatives)}\n\n## Open questions\n\n${bullets(output.questions)}\n\nEvaluated commit: ${e.baseSha}. Confirmed business context version: ${e.profileVersion}. Evidence batch: ${e.covered} insights; ${e.omitted ? "additional library evidence was omitted" : "this topic evidence batch was inspected"}. ${snapshotCoverage} Benefit and effort remain hypotheses. No coding, branch, PR or merge is approved by this issue.\n\n${marker}`;
  safeDraft(output.title, body, marker, false);
  return ctx.db.insert("issueDrafts", {
    organizationId: e.organizationId,
    evaluationId: e._id,
    ...(e.privateEvaluationOrigin
      ? { privateEvaluationOrigin: e.privateEvaluationOrigin }
      : {}),
    repositoryId: e.repositoryId,
    topicId: e.topicId,
    topicVersion: e.topicVersion,
    baseSha: e.baseSha,
    profileVersion: e.profileVersion,
    selectionVersion: e.selectionVersion ?? 0,
    references: e.references,
    title: output.title,
    body,
    hash: await digest(`${output.title}\n${body}`),
    version: 1,
    marker,
    state: "draft",
    sensitive: false,
    followUp: a.followUp,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export const create = mutation({
  args: { id: v.id("knowledgeEvaluations"), followUp: v.boolean() },
  handler: (ctx, a) => createIssueCore(ctx, a),
});
export const edit = mutation({
  args: {
    id: v.id("issueDrafts"),
    version: v.number(),
    title: v.string(),
    body: v.string(),
    includePermittedExcerpts: v.boolean(),
  },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.id);
    ensure(d, "FORBIDDEN", "Issue unavailable.");
    await writeAccess(ctx, d.organizationId);
    ensure(
      d.state === "draft" && d.version === a.version,
      "APPROVAL_STALE",
      "Review the current editable draft.",
    );
    safeDraft(a.title, a.body, d.marker, a.includePermittedExcerpts);
    await ctx.db.patch(d._id, {
      title: a.title,
      body: a.body,
      sensitive: a.includePermittedExcerpts,
      version: d.version + 1,
      hash: await digest(`${a.title}\n${a.body}`),
      visibility: undefined,
      permissionCheckedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});
export const list = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
    id: v.optional(v.id("issueDrafts")),
  },
  handler: async (ctx, a) => {
    ctx = knowledgeReadContext(ctx);
    await access(ctx, a.organizationId);
    const exact = a.id ? await ctx.db.get(a.id) : null;
    ensure(
      !a.id || exact?.organizationId === a.organizationId,
      "FORBIDDEN",
      "Proposal unavailable.",
    );
    const page = a.id
      ? { page: exact ? [exact] : [], isDone: true, continueCursor: "" }
      : await ctx.db
          .query("issueDrafts")
          .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
          .order("desc")
          .paginate({ cursor: a.cursor ?? null, numItems: 30 });
    const items = [];
    for (const d of page.page) {
      const attempts = await ctx.db
        .query("issueAttempts")
        .withIndex("by_draft", (q) => q.eq("draftId", d._id))
        .collect();
      const surviving = await referencesCurrent(
        ctx,
        d.organizationId,
        d.references,
      );
      items.push({
        ...d,
        ...(!surviving ? { title: "Unavailable private draft", body: "" } : {}),
        current: await draftCurrent(ctx, d),
        permissionCurrent:
          publicationEnabled() &&
          !!d.permissionCheckedAt &&
          Date.now() - d.permissionCheckedAt < 120000,
        repository:
          (await ctx.db.get(d.repositoryId))?.fullName ??
          "Unavailable repository",
        attempts,
      });
    }
    return { items, next: page.isDone ? null : page.continueCursor };
  },
});
export const context = query({
  args: { id: v.id("issueDrafts") },
  handler: async (ctx, a) => {
    const draft = await ctx.db.get(a.id);
    ensure(draft, "FORBIDDEN", "Issue unavailable.");
    const { actor } = await access(ctx, draft.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    ensure(
      await draftCurrent(ctx, draft),
      "APPROVAL_STALE",
      "Source, organization or repository context changed. Review a new evaluation.",
    );
    const repo = await ctx.db.get(draft.repositoryId);
    ensure(repo?.enabled, "FORBIDDEN", "Repository is no longer selected.");
    return { draft, repo, actor: actor._id };
  },
});
// Visibility is useful for safe export/review even if the separate write-permission request is denied.
export const observeVisibility = internalMutation({
  args: {
    id: v.id("issueDrafts"),
    hash: v.string(),
    visibility: v.union(v.literal("private"), v.literal("public")),
  },
  handler: async (ctx, a) => {
    ensure(
      publicationEnabled(),
      "POLICY_BLOCKED",
      "Issue publishing is paused.",
    );
    const d = await ctx.db.get(a.id);
    ensure(
      d &&
        d.state === "draft" &&
        d.hash === a.hash &&
        (await draftCurrent(ctx, d)),
      "APPROVAL_STALE",
      "Review the current draft.",
    );
    await writeAccess(ctx, d.organizationId);
    await ctx.db.patch(d._id, {
      visibility: a.visibility,
      permissionCheckedAt: undefined,
    });
  },
});
export const prepared = internalMutation({
  args: {
    id: v.id("issueDrafts"),
    hash: v.string(),
    visibility: v.union(v.literal("private"), v.literal("public")),
  },
  handler: async (ctx, a) => {
    ensure(
      publicationEnabled(),
      "POLICY_BLOCKED",
      "Issue publishing is paused.",
    );
    const d = await ctx.db.get(a.id);
    ensure(
      d &&
        d.state === "draft" &&
        d.hash === a.hash &&
        (await draftCurrent(ctx, d)),
      "APPROVAL_STALE",
      "Issue changed during permission verification.",
    );
    await ctx.db.patch(d._id, {
      visibility: a.visibility,
      permissionCheckedAt: Date.now(),
    });
  },
});
// Approval consumes one immutable attempt before any provider write. No API accepts a model approval.
export const approve = mutation({
  args: {
    id: v.id("issueDrafts"),
    version: v.number(),
    hash: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    publicationRights: v.boolean(),
  },
  handler: async (ctx, a) => {
    ensure(
      publicationEnabled(),
      "POLICY_BLOCKED",
      "Issue publishing is paused.",
    );
    const d = await ctx.db.get(a.id);
    ensure(d, "FORBIDDEN", "Issue unavailable.");
    const { actor } = await writeAccess(ctx, d.organizationId);
    ensure(
      d.state === "draft" &&
        d.version === a.version &&
        d.hash === a.hash &&
        d.visibility === a.visibility &&
        Date.now() - (d.permissionCheckedAt ?? 0) < 120000 &&
        (await draftCurrent(ctx, d)),
      "APPROVAL_STALE",
      "Review the exact current text, target and visibility after verifying permission.",
    );
    ensure(
      a.publicationRights,
      "RIGHTS_REQUIRED",
      "Confirm rights to publish exactly the reviewed text.",
    );
    issueApproval.parse(a);
    safeDraft(d.title, d.body, d.marker, d.sensitive);
    const existing = await ctx.db
      .query("issueAttempts")
      .withIndex("by_draft", (q) => q.eq("draftId", d._id))
      .collect();
    ensure(
      !existing.length,
      "PUBLICATION_UNKNOWN",
      "An attempt already exists. Reconcile it; never retry blindly.",
    );
    const id = await ctx.db.insert("issueAttempts", {
      organizationId: d.organizationId,
      draftId: d._id,
      repositoryId: d.repositoryId,
      actor: actor._id,
      hash: d.hash,
      draftVersion: d.version,
      marker: d.marker,
      visibility: a.visibility,
      state: "approved",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(d._id, { state: "approved" });
    await audit(ctx, d.organizationId, actor._id, "issue.approved", id);
    return id;
  },
});
export const claim = internalMutation({
  args: { id: v.id("issueAttempts") },
  handler: async (ctx, a) => {
    ensure(
      publicationEnabled(),
      "POLICY_BLOCKED",
      "Issue publishing is paused.",
    );
    const attempt = await ctx.db.get(a.id);
    ensure(
      attempt?.state === "approved",
      "PUBLICATION_UNKNOWN",
      "The publication was already claimed. Reconcile its status.",
    );
    const draft = await ctx.db.get(attempt.draftId),
      repo = await ctx.db.get(attempt.repositoryId);
    ensure(
      draft &&
        repo?.enabled &&
        draft.hash === attempt.hash &&
        draft.version === attempt.draftVersion &&
        draft.visibility === attempt.visibility &&
        (await draftCurrent(ctx, draft)) &&
        (await actorCurrent(ctx, draft.organizationId, attempt.actor)),
      "APPROVAL_STALE",
      "Issue approval or access changed.",
    );
    safeDraft(draft.title, draft.body, draft.marker, draft.sensitive);
    await ctx.db.patch(attempt._id, {
      state: "publishing",
      updatedAt: Date.now(),
    });
    return { attempt, draft, repo };
  },
});
export const receipt = internalMutation({
  args: {
    id: v.id("issueAttempts"),
    state: v.union(
      v.literal("published"),
      v.literal("unknown"),
      v.literal("denied"),
    ),
    number: v.optional(v.number()),
    url: v.optional(v.string()),
    externalState: v.optional(v.string()),
    externalEdited: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const attempt = await ctx.db.get(a.id);
    if (!attempt) return;
    if (
      attempt.number &&
      (a.state !== "published" ||
        (a.number !== undefined && a.number !== attempt.number))
    )
      return;
    const { id: _id, ...fields } = a;
    await ctx.db.patch(attempt._id, {
      ...fields,
      observedAt: Date.now(),
      updatedAt: Date.now(),
    });
    const draft = await ctx.db.get(attempt.draftId);
    if (draft)
      await ctx.db.patch(draft._id, { state: a.state, updatedAt: Date.now() });
  },
});
export const attemptContext = query({
  args: { id: v.id("issueAttempts") },
  handler: async (ctx, a) => {
    const attempt = await ctx.db.get(a.id);
    ensure(attempt, "FORBIDDEN", "Receipt unavailable.");
    await access(ctx, attempt.organizationId, ["owner", "admin", "member"]);
    const repo = await ctx.db.get(attempt.repositoryId);
    ensure(repo?.enabled, "FORBIDDEN", "Repository access is unavailable.");
    const draft = await ctx.db.get(attempt.draftId);
    return {
      attempt,
      repo,
      draft:
        draft &&
        (await referencesCurrent(ctx, draft.organizationId, draft.references))
          ? draft
          : null,
    };
  },
});
export const updateObservation = internalMutation({
  args: { id: v.id("issueAttempts"), state: v.string(), edited: v.boolean() },
  handler: async (ctx, a) => {
    if (process.env.RESTORE_LOCK === "true") return;
    const attempt = await ctx.db.get(a.id);
    if (attempt)
      await ctx.db.patch(attempt._id, {
        externalState: a.state,
        externalEdited: a.edited,
        observedAt: Date.now(),
        updatedAt: Date.now(),
      });
  },
});
export const reconcileContext = internalQuery({
  args: { id: v.id("issueAttempts") },
  handler: async (ctx, a) => {
    if (!publicationEnabled()) return null;
    const attempt = await ctx.db.get(a.id);
    if (
      !attempt ||
      !(await actorCurrent(ctx, attempt.organizationId, attempt.actor))
    )
      return null;
    const repo = await ctx.db.get(attempt.repositoryId);
    if (!repo?.enabled) return null;
    return { attempt, repo, draft: await ctx.db.get(attempt.draftId) };
  },
});
export const reconcilePage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (!publicationEnabled()) return;
    const page = await ctx.db
      .query("issueAttempts")
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    for (const attempt of page.page)
      if (
        ["published", "unknown", "publishing"].includes(attempt.state) &&
        Date.now() - (attempt.observedAt ?? attempt.updatedAt) > 60000
      )
        await ctx.scheduler.runAfter(0, internal.issueActions.reconcileOne, {
          id: attempt._id,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.issues.reconcilePage, {
        cursor: page.continueCursor,
      });
  },
});
export const enqueueWebhook = internalMutation({
  args: {
    installationId: v.number(),
    providerId: v.number(),
    number: v.number(),
    delivery: v.string(),
  },
  handler: async (ctx, a) => {
    if (!publicationEnabled()) return;
    const eventId = `issue:${a.delivery}`;
    if (
      await ctx.db
        .query("events")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .unique()
    )
      return;
    await ctx.db.insert("events", { eventId, processedAt: Date.now() });
    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_github", (q) =>
        q.eq("installationId", a.installationId).eq("providerId", a.providerId),
      )
      .collect();
    for (const repo of repos)
      await ctx.scheduler.runAfter(0, internal.issues.webhookPage, {
        repositoryId: repo._id,
        number: a.number,
      });
  },
});

export const webhookPage = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    number: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!publicationEnabled()) return;
    const page = await ctx.db
      .query("issueAttempts")
      .withIndex("by_repo", (q) => q.eq("repositoryId", a.repositoryId))
      .paginate({ cursor: a.cursor ?? null, numItems: 20 });
    for (const attempt of page.page)
      if (
        attempt.number === a.number ||
        (!attempt.number && ["unknown", "publishing"].includes(attempt.state))
      )
        await ctx.scheduler.runAfter(0, internal.issueActions.reconcileOne, {
          id: attempt._id,
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.issues.webhookPage, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
