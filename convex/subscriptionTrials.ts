import { presentAnalysis } from "../packages/insights/presentation";
import { query } from "./_generated/server";
import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { access, writeAccess, audit, limit } from "./lib";
import { ensure, containsSecret } from "../packages/policy";
import { personalAllowed } from "./lib/personalAccess";
import { digest } from "./product";
import { insightOutput } from "../packages/contracts";
import { canonicalJson } from "../packages/contracts/canonical-json.mjs";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const fingerprint = (s: Doc<"sources">) =>
  digest(
    canonicalJson({
      generation: s.generation,
      text: s.text,
      analysis: s.analysis,
      acquisition: s.acquisition,
      mediaEvidence: s.mediaEvidence,
      coverage: s.coverage,
      kind: s.kind,
      updatedAt: s.updatedAt,
    }),
  );
export async function trialCurrent(
  ctx: QueryCtx,
  t: Doc<"subscriptionTrials">,
) {
  if (t.state === "canceled" || t.expiresAt <= Date.now()) return false;
  for (const f of t.input.sources) {
    const s = await ctx.db.get(f.id as Id<"sources">);
    if (
      !s ||
      s.organizationId !== t.organizationId ||
      s.state === "deleted" ||
      !s.rightsAttested ||
      (await fingerprint(s)) !== f.inputHash
    )
      return false;
  }
  return true;
}

// Personal, user-operated experiments. They cannot grant publishing/coding
// authority, overwrite reviewed analyses, or dispatch managed paid inference.
const org = { organizationId: v.id("organizations") };
export const list = query({
  args: org,
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    if (!personalAllowed(actor.subject)) return [];
    const rows = await ctx.db
      .query("subscriptionTrials")
      .withIndex("by_actor", (q) =>
        q.eq("organizationId", a.organizationId).eq("actor", actor._id),
      )
      .order("desc")
      .take(10);
    return Promise.all(
      rows.map(async (t) => {
        const { input: _input, ...row } = t;
        return (await trialCurrent(ctx, t))
          ? row
          : {
              ...row,
              results: undefined,
              state: t.state === "canceled" ? "canceled" : "expired",
            };
      }),
    );
  },
});
export const prepare = mutation({
  args: {
    ...org,
    sources: v.array(v.id("sources")),
    route: v.union(v.literal("local"), v.literal("codex_cloud")),
    effort: v.union(v.literal("low"), v.literal("medium")),
    useOwnPlan: v.boolean(),
  },
  handler: async (ctx, a) => {
    const { actor } = await writeAccess(ctx, a.organizationId);
    await limit(ctx, `subscription-trial:${actor._id}`, 6);
    ensure(
      personalAllowed(actor.subject) && a.useOwnPlan,
      "FORBIDDEN",
      "Approve your own subscription for this trial.",
    );
    ensure(
      a.sources.length > 0 &&
        a.sources.length <= 5 &&
        new Set(a.sources).size === a.sources.length,
      "INVALID_INPUT",
      "Choose one to five posts.",
    );
    const sources = [];
    for (const id of a.sources) {
      const s = await ctx.db.get(id);
      ensure(
        s?.organizationId === a.organizationId &&
          s.state !== "deleted" &&
          s.rightsAttested &&
          !["processing", "queued"].includes(s.state),
        "FORBIDDEN",
        "Choose available posts in this workspace.",
      );
      const transcript = s.text ?? "";
      const caption =
        s.acquisition?.status === "acquired"
          ? (s.acquisition.description ?? "")
          : "";
      const timed = (s.mediaEvidence ?? []).filter(
        (e: any) => e.kind === "transcript",
      );
      const text = transcript || caption;
      const evidence =
        transcript && timed.length
          ? timed
          : [
              {
                kind: transcript ? "user_note" : "caption",
                id: transcript ? "supplied_text" : "post_caption",
                startMs: null,
                endMs: null,
              },
            ];
      if (caption && transcript && timed.length)
        evidence.push({
          kind: "caption",
          id: "post_caption",
          startMs: null,
          endMs: null,
        });
      ensure(
        text.length > 0 && text.length <= 60000 && evidence.length <= 224,
        "INVALID_EVIDENCE",
        "Prepare this post's text before starting a trial.",
      );
      sources.push({
        id,
        generation: s.generation,
        updatedAt: s.updatedAt,
        title: s.title,
        ...(s.url ? { url: s.url } : {}),
        text,
        ...(caption ? { caption } : {}),
        coverage: transcript && timed.length ? "audio_only" : "caption_only",
        evidence,
        warnings: [
          "This trial includes prepared text only. No video frames are supplied.",
          ...(timed.length
            ? [
                "The automatic transcript is aggregated; verify exact wording and segment timing against the source.",
              ]
            : []),
        ],
        inputHash: await fingerprint(s),
      });
    }
    ensure(
      !containsSecret(JSON.stringify(sources)),
      "INVALID_INPUT",
      "Remove private credentials from this evidence before exporting.",
    );
    const input = {
      schemaVersion: "1.0.0",
      organizationId: a.organizationId,
      model: "gpt-6.1-sol",
      effort: a.effort,
      route: a.route,
      sources,
    };
    ensure(
      new TextEncoder().encode(JSON.stringify(input)).length <= 400000,
      "INVALID_INPUT",
      "Choose fewer posts for this trial.",
    );
    const now = Date.now();
    const expiresAt = now + 86400000;
    const id = await ctx.db.insert("subscriptionTrials", {
      organizationId: a.organizationId,
      actor: actor._id,
      route: a.route,
      model: "gpt-6.1-sol",
      effort: a.effort,
      state: "prepared",
      input,
      bundleHash: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, {
      bundleHash: await digest(
        canonicalJson({ trialId: id, expiresAt, ...input }),
      ),
    });
    await ctx.scheduler.runAfter(86400000, internal.subscriptionTrials.expire, {
      id,
    });
    await audit(
      ctx,
      a.organizationId,
      actor._id,
      "subscription_trial_prepared",
      id,
    );
    return id;
  },
});
export const bundle = query({
  args: { id: v.id("subscriptionTrials") },
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.id);
    ensure(t, "FORBIDDEN", "Trial unavailable.");
    const { actor } = await access(ctx, t.organizationId);
    ensure(
      actor._id === t.actor &&
        personalAllowed(actor.subject) &&
        t.state !== "canceled" &&
        t.expiresAt > Date.now(),
      "APPROVAL_STALE",
      "Review your trial permission again.",
    );
    ensure(
      await trialCurrent(ctx, t),
      "APPROVAL_STALE",
      "A post changed. Prepare a fresh trial.",
    );
    return {
      trialId: t._id,
      bundleHash: t.bundleHash,
      expiresAt: t.expiresAt,
      ...t.input,
    };
  },
});
export const finish = mutation({
  args: {
    id: v.id("subscriptionTrials"),
    bundleHash: v.string(),
    results: v.any(),
  },
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.id);
    ensure(t, "FORBIDDEN", "Trial unavailable.");
    const { actor } = await writeAccess(ctx, t.organizationId);
    ensure(
      actor._id === t.actor &&
        personalAllowed(actor.subject) &&
        t.state === "prepared" &&
        t.expiresAt > Date.now() &&
        a.bundleHash === t.bundleHash,
      "APPROVAL_STALE",
      "Trial permission expired or changed.",
    );
    ensure(
      Array.isArray(a.results) &&
        a.results.length === t.input.sources.length &&
        new TextEncoder().encode(JSON.stringify(a.results)).length <= 500000 &&
        !containsSecret(JSON.stringify(a.results)),
      "INVALID_INPUT",
      "Return one bounded result per selected post.",
    );
    const seen = new Set();
    const normalized = [];
    for (const raw of a.results) {
      const output: any = presentAnalysis(insightOutput.parse(raw) as any);
      const f = t.input.sources.find((s: any) => s.id === output.sourceId);
      ensure(
        f &&
          !seen.has(f.id) &&
          output.processingRunId === `${t._id}:${f.id}` &&
          output.coverage === f.coverage,
        "INVALID_EVIDENCE",
        "Return the exact trial source and coverage.",
      );
      seen.add(f.id);
      const s = await ctx.db.get(f.id as Id<"sources">);
      ensure(
        s?.organizationId === t.organizationId &&
          s.state !== "deleted" &&
          s.rightsAttested &&
          f.inputHash === (await fingerprint(s)),
        "APPROVAL_STALE",
        "A post changed. Its corrections take precedence.",
      );
      for (const i of output.insights)
        for (const e of i.evidence)
          ensure(
            f.evidence.some(
              (ref: any) =>
                ref.kind === e.kind &&
                ref.id === e.id &&
                ref.startMs === e.startMs &&
                ref.endMs === e.endMs,
            ),
            "INVALID_EVIDENCE",
            "An evidence reference was not supplied.",
          );
      output.warnings = [...new Set([...f.warnings, ...output.warnings])].slice(
        0,
        20,
      );
      normalized.push(output);
    }
    await ctx.db.patch(t._id, {
      state: "completed",
      results: normalized,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      t.organizationId,
      actor._id,
      "subscription_trial_returned",
      t._id,
    );
    return { accepted: true };
  },
});
export const cancel = mutation({
  args: { id: v.id("subscriptionTrials") },
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.id);
    ensure(t, "FORBIDDEN", "Trial unavailable.");
    const { actor } = await writeAccess(ctx, t.organizationId);
    ensure(
      actor._id === t.actor,
      "FORBIDDEN",
      "Only the approving account can cancel this trial.",
    );
    await ctx.db.patch(t._id, {
      state: "canceled",
      input: { sources: [] },
      results: undefined,
      updatedAt: Date.now(),
    });
  },
});
export const redact = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceId: v.id("sources"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, a) => {
    const page = await ctx.db
      .query("subscriptionTrials")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .paginate({ cursor: a.cursor, numItems: 100 });
    for (const t of page.page)
      if (t.input.sources.some((s: any) => s.id === a.sourceId))
        await ctx.db.patch(t._id, {
          state: "canceled",
          input: { sources: [] },
          results: undefined,
          updatedAt: Date.now(),
        });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.subscriptionTrials.redact, {
        ...a,
        cursor: page.continueCursor,
      });
  },
});
export const expire = internalMutation({
  args: { id: v.id("subscriptionTrials") },
  handler: async (ctx, a) => {
    const t = await ctx.db.get(a.id);
    if (t && t.expiresAt <= Date.now())
      await ctx.db.patch(t._id, {
        state: "expired",
        input: { sources: [] },
        results: undefined,
        updatedAt: Date.now(),
      });
  },
});
