import {
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assistantGrant } from "./lib/assistantPrincipal";
import { checkTopicParent } from "./lib/topicStructure";
import { ensure, containsSecret } from "../packages/policy";
import { categoryName } from "../packages/categories";
import { audit, limit } from "./lib";
import { digest } from "./product";
import { sourceFor } from "./assistant";
import { referencesCurrent } from "./knowledge";
import {
  filingInput,
  filingStateInput,
  filingReceiptInput,
  sameFilingReference,
} from "../packages/widget/evidence-filing";
import {
  libraryEditInput,
  libraryEditReceiptInput,
  libraryEditStateInput,
  libraryEditVersion,
} from "../packages/widget/library-edits";

const context = {
  profileId: v.id("organizations"),
  grantVersion: v.number(),
  topicId: v.id("knowledgeTopics"),
};
const operation = v.union(
  v.literal("rename"),
  v.literal("pin"),
  v.literal("structure"),
);
const receiptValue = v.object({
  schema_version: v.literal("vibescroll-library-edit-v1"),
  profile_id: v.id("organizations"),
  grant_version: v.number(),
  topic_id: v.id("knowledgeTopics"),
  topic_version: v.number(),
  layout_version: v.number(),
  request_key: v.string(),
  operation,
  applied: v.literal(true),
  processing_started: v.literal(false),
});

async function authorize(
  ctx: QueryCtx,
  args: { profileId: Id<"organizations">; grantVersion: number },
) {
  ensure(
    process.env.MCP_WIDGET_LIBRARY_EDITING_ENABLED === "true",
    "FORBIDDEN",
    "Widget library editing is unavailable.",
  );
  const a = await assistantGrant(ctx, args.profileId, "knowledge:write");
  ensure(
    a.scopes.includes("knowledge:read") &&
      a.client.scopes.includes("knowledge:read") &&
      a.grant.scopes.includes("knowledge:read") &&
      a.grant.libraryScope === "all",
    "FORBIDDEN",
    "Topic editing needs reviewed read and edit access to the whole library.",
  );
  ensure(
    Number.isSafeInteger(args.grantVersion) &&
      a.grant.version === args.grantVersion,
    "APPROVAL_STALE",
    "Access changed. Review the current connection.",
  );
  return a;
}

async function currentTopic(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  id: Id<"knowledgeTopics">,
) {
  const topic = await ctx.db.get(id);
  ensure(
    topic &&
      topic.organizationId === organizationId &&
      !topic.redirect &&
      topic.state !== "deleted",
    "FORBIDDEN",
    "Topic unavailable.",
  );
  return topic;
}

function receipt(row: Doc<"assistantLibraryCommands">) {
  ensure(
    row.operation !== "file",
    "INVALID_INPUT",
    "This request key belongs to an idea filing.",
  );
  return {
    schema_version: libraryEditVersion,
    profile_id: row.organizationId,
    grant_version: row.grantVersion,
    topic_id: row.topicId,
    topic_version: row.topicVersion,
    layout_version: row.layoutVersion,
    request_key: row.key,
    operation: row.operation,
    applied: true as const,
    processing_started: false as const,
  } as const;
}

export const state = internalQuery({
  args: context,
  returns: v.object({
    schema_version: v.literal("vibescroll-library-edit-v1"),
    profile_id: v.id("organizations"),
    grant_version: v.number(),
    topic: v.object({
      id: v.id("knowledgeTopics"),
      name: v.string(),
      pinned: v.boolean(),
      aliases: v.array(v.string()),
      parent_id: v.union(v.id("knowledgeTopics"), v.null()),
      version: v.number(),
      layout_version: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    libraryEditStateInput.parse(args);
    const a = await authorize(ctx, args);
    const topic = await currentTopic(ctx, a.organization._id, args.topicId);
    ensure(
      topic.name.length <= 160 &&
        (topic.aliases?.length ?? 0) <= 8 &&
        (topic.aliases ?? []).every((name) => name.length <= 160),
      "INVALID_INPUT",
      "Review this topic in the protected library.",
    );
    return {
      schema_version: libraryEditVersion,
      profile_id: a.organization._id,
      grant_version: a.grant.version,
      topic: {
        id: topic._id,
        name: topic.name,
        pinned: topic.pinned,
        aliases: topic.aliases ?? [],
        parent_id: topic.parentId ?? null,
        version: topic.version,
        layout_version: topic.layoutVersion ?? 0,
      },
    } as const;
  },
});

export const outcome = internalQuery({
  args: { ...context, key: v.string() },
  returns: v.union(receiptValue, v.null()),
  handler: async (ctx, args) => {
    libraryEditReceiptInput.parse(args);
    const a = await authorize(ctx, args);
    await currentTopic(ctx, a.organization._id, args.topicId);
    const old = await ctx.db
      .query("assistantLibraryCommands")
      .withIndex("by_request", (q) =>
        q
          .eq("grantId", a.grant._id)
          .eq("grantVersion", args.grantVersion)
          .eq("key", args.key),
      )
      .unique();
    if (old && old.expiresAt <= Date.now()) return null;
    ensure(
      !old || old.topicId === args.topicId,
      "INVALID_INPUT",
      "The request key belongs to a different topic.",
    );
    return old ? receipt(old) : null;
  },
});

export const change = internalMutation({
  args: {
    ...context,
    expectedVersion: v.number(),
    expectedLayoutVersion: v.number(),
    key: v.string(),
    explicitlyRequested: v.literal(true),
    change: v.union(
      v.object({ kind: v.literal("rename"), name: v.string() }),
      v.object({ kind: v.literal("pin"), pinned: v.boolean() }),
      v.object({
        kind: v.literal("structure"),
        parentId: v.union(v.id("knowledgeTopics"), v.null()),
        aliases: v.array(v.string()),
      }),
    ),
  },
  returns: receiptValue,
  handler: async (ctx, args) => {
    const input = libraryEditInput.parse(args);
    const a = await authorize(ctx, args);
    const topic = await currentTopic(ctx, a.organization._id, args.topicId);
    const inputHash = await digest(JSON.stringify(input));
    const old = await ctx.db
      .query("assistantLibraryCommands")
      .withIndex("by_request", (q) =>
        q
          .eq("grantId", a.grant._id)
          .eq("grantVersion", args.grantVersion)
          .eq("key", args.key),
      )
      .unique();
    if (old) {
      ensure(
        old.expiresAt > Date.now(),
        "APPROVAL_STALE",
        "The retained receipt expired. Review the current topic.",
      );
      ensure(
        old.inputHash === inputHash && old.topicId === topic._id,
        "INVALID_INPUT",
        "Keep the request key bound to its original change.",
      );
      return receipt(old);
    }
    ensure(
      topic.version === args.expectedVersion &&
        (topic.layoutVersion ?? 0) === args.expectedLayoutVersion,
      "APPROVAL_STALE",
      "Topic changed. Review it before saving another change.",
    );
    await limit(ctx, `assistant-library:${a.actor._id}:${a.client.id}`, 20);
    const command = args.change;
    let topicVersion = topic.version;
    let layoutVersion = topic.layoutVersion ?? 0;
    if (command.kind === "structure") {
      const aliases = [...new Set(command.aliases.map(categoryName))];
      ensure(
        !aliases.some(containsSecret),
        "POLICY_BLOCKED",
        "Do not include credentials in topic names.",
      );
      await checkTopicParent(ctx, topic, command.parentId);
      layoutVersion++;
      await ctx.db.patch(topic._id, {
        parentId: command.parentId ?? undefined,
        aliases,
        searchText: [topic.name, ...aliases].join(" "),
        layoutVersion,
        updatedAt: Date.now(),
      });
    } else {
      const name =
        command.kind === "rename" ? categoryName(command.name) : topic.name;
      ensure(
        !containsSecret(name),
        "POLICY_BLOCKED",
        "Do not include credentials in topic names.",
      );
      topicVersion++;
      await ctx.db.patch(topic._id, {
        ...(command.kind === "rename"
          ? { name, searchText: [name, ...(topic.aliases ?? [])].join(" ") }
          : { pinned: command.pinned }),
        version: topicVersion,
        state: "pending",
        resumeCursor: undefined,
        updatedAt: Date.now(),
      });
    }
    // Metadata editing never dispatches synthesis, analysis, coding or publication.
    const id = await ctx.db.insert("assistantLibraryCommands", {
      organizationId: a.organization._id,
      actor: a.actor._id,
      clientId: a.client.id,
      grantId: a.grant._id,
      grantVersion: a.grant.version,
      key: args.key,
      inputHash,
      topicId: topic._id,
      operation: command.kind,
      topicVersion,
      layoutVersion,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 86400000,
    });
    await audit(
      ctx,
      a.organization._id,
      a.actor._id,
      `assistant.topic_${command.kind}`,
      topic._id,
    );
    const saved = await ctx.db.get(id);
    ensure(saved, "INVALID_INPUT", "The change receipt is unavailable.");
    return receipt(saved);
  },
});

const evidenceReference = {
  sourceId: v.id("sources"),
  generation: v.number(),
  revision: v.number(),
  insightId: v.string(),
};
const evidenceContext = {
  profileId: v.id("organizations"),
  grantVersion: v.number(),
  reference: v.object(evidenceReference),
};
const filingReceiptValue = v.object({
  schema_version: v.literal("vibescroll-evidence-filing-v1"),
  profile_id: v.id("organizations"),
  grant_version: v.number(),
  reference: v.object(evidenceReference),
  request_key: v.string(),
  operation: v.union(
    v.literal("move"),
    v.literal("exclude"),
    v.literal("restore"),
  ),
  origin_topic_id: v.id("knowledgeTopics"),
  origin_member_id: v.id("knowledgeMembers"),
  origin_version: v.number(),
  excluded: v.boolean(),
  destination: v.union(
    v.null(),
    v.object({
      topic_id: v.id("knowledgeTopics"),
      member_id: v.id("knowledgeMembers"),
      version: v.number(),
    }),
  ),
  applied: v.literal(true),
  processing_started: v.literal(false),
});
async function authorizeEvidence(
  ctx: QueryCtx,
  args: {
    profileId: Id<"organizations">;
    grantVersion: number;
    reference: {
      sourceId: Id<"sources">;
      generation: number;
      revision: number;
      insightId: string;
    };
  },
) {
  const a = await authorize(ctx, args);
  const source = await sourceFor(ctx, a, args.reference.sourceId);
  ensure(
    source &&
      (await referencesCurrent(ctx, a.organization._id, [args.reference])),
    "APPROVAL_STALE",
    "This idea or its access changed. Load its current evidence.",
  );
  return a;
}
function evidenceReceipt(row: Doc<"assistantLibraryCommands">) {
  ensure(
    row.operation === "file" && row.evidence,
    "INVALID_INPUT",
    "This key belongs to another library change.",
  );
  const {
    sourceId,
    generation,
    revision,
    insightId,
    destination,
    memberId,
    kind,
    excluded,
  } = row.evidence;
  return {
    schema_version: "vibescroll-evidence-filing-v1" as const,
    profile_id: row.organizationId,
    grant_version: row.grantVersion,
    reference: { sourceId, generation, revision, insightId },
    request_key: row.key,
    operation: kind,
    origin_topic_id: row.topicId,
    origin_member_id: memberId,
    origin_version: row.topicVersion,
    excluded,
    destination: destination
      ? {
          topic_id: destination.topicId,
          member_id: destination.memberId,
          version: destination.version,
        }
      : null,
    applied: true as const,
    processing_started: false as const,
  };
}
export const evidenceState = internalQuery({
  args: {
    ...evidenceContext,
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    schema_version: v.literal("vibescroll-evidence-filing-v1"),
    profile_id: v.id("organizations"),
    grant_version: v.number(),
    reference: v.object(evidenceReference),
    items: v.array(
      v.object({
        member_id: v.id("knowledgeMembers"),
        topic_id: v.id("knowledgeTopics"),
        name: v.string(),
        version: v.number(),
        excluded: v.boolean(),
      }),
    ),
    next_cursor: v.union(v.string(), v.null()),
    coverage: v.string(),
  }),
  handler: async (ctx, args) => {
    filingStateInput.parse(args);
    const a = await authorizeEvidence(ctx, args);
    const binding = JSON.stringify([
      a.grant._id,
      a.grant.version,
      args.reference.sourceId,
      args.reference.generation,
      args.reference.revision,
      args.reference.insightId,
    ]);
    let cursor: string | null = null;
    if (args.cursor) {
      let parsed;
      try {
        parsed = JSON.parse(args.cursor);
      } catch {
        ensure(false, "INVALID_INPUT", "Invalid filing page.");
      }
      ensure(
        parsed &&
          parsed.binding === binding &&
          typeof parsed.cursor === "string",
        "APPROVAL_STALE",
        "Reload the current idea filings.",
      );
      cursor = parsed.cursor;
    }
    const ref = args.reference;
    const page = await ctx.db
      .query("knowledgeMembers")
      .withIndex("by_reference", (q) =>
        q
          .eq("organizationId", a.organization._id)
          .eq("sourceId", ref.sourceId)
          .eq("generation", ref.generation)
          .eq("revision", ref.revision)
          .eq("insightId", ref.insightId),
      )
      .paginate({ cursor, numItems: 12 });
    const items = [];
    for (const member of page.page) {
      if (member.retainedHistory) continue;
      const topic = await ctx.db.get(member.topicId);
      if (
        !topic ||
        topic.organizationId !== a.organization._id ||
        topic.redirect ||
        topic.state === "deleted"
      )
        continue;
      ensure(
        topic.name.length <= 160,
        "INVALID_INPUT",
        "Review this topic in the protected library.",
      );
      items.push({
        member_id: member._id,
        topic_id: topic._id,
        name: topic.name,
        version: topic.version,
        excluded: member.excluded,
      });
    }
    return {
      schema_version: "vibescroll-evidence-filing-v1" as const,
      profile_id: a.organization._id,
      grant_version: a.grant.version,
      reference: ref,
      items,
      next_cursor: page.isDone
        ? null
        : JSON.stringify({ binding, cursor: page.continueCursor }),
      coverage:
        "Current topic filings for this exact idea. Removed filings can be restored; filing does not change source access or start processing.",
    };
  },
});
export const evidenceOutcome = internalQuery({
  args: { ...evidenceContext, key: v.string() },
  returns: v.union(filingReceiptValue, v.null()),
  handler: async (ctx, args) => {
    filingReceiptInput.parse(args);
    const a = await authorizeEvidence(ctx, args);
    const old = await ctx.db
      .query("assistantLibraryCommands")
      .withIndex("by_request", (q) =>
        q
          .eq("grantId", a.grant._id)
          .eq("grantVersion", a.grant.version)
          .eq("key", args.key),
      )
      .unique();
    if (!old || old.expiresAt <= Date.now()) return null;
    const result = evidenceReceipt(old);
    ensure(
      sameFilingReference(result.reference, args.reference),
      "INVALID_INPUT",
      "The key belongs to a different idea.",
    );
    await currentTopic(ctx, a.organization._id, old.topicId);
    if (old.evidence?.destination)
      await currentTopic(
        ctx,
        a.organization._id,
        old.evidence.destination.topicId,
      );
    return result;
  },
});
async function membersForCount(
  ctx: QueryCtx,
  topicId: Id<"knowledgeTopics">,
  sourceId: Id<"sources">,
) {
  const rows = await ctx.db
    .query("knowledgeMembers")
    .withIndex("by_topic_source", (q) =>
      q.eq("topicId", topicId).eq("sourceId", sourceId),
    )
    .take(257);
  ensure(
    rows.length <= 256,
    "INVALID_INPUT",
    "Review this large topic/source filing in the protected library.",
  );
  return rows.filter((row) => !row.retainedHistory);
}
async function touchFiling(
  ctx: MutationCtx,
  topic: Doc<"knowledgeTopics">,
  before: number,
  after: number,
) {
  await ctx.db.patch(topic._id, {
    version: topic.version + 1,
    state: "pending",
    resumeCursor: undefined,
    updatedAt: Date.now(),
    ...(topic.insightCount === undefined
      ? {}
      : { insightCount: Math.max(0, topic.insightCount + after - before) }),
    ...(topic.sourceCount === undefined
      ? {}
      : {
          sourceCount: Math.max(
            0,
            topic.sourceCount + Number(after > 0) - Number(before > 0),
          ),
        }),
  });
}
export const fileEvidence = internalMutation({
  args: {
    ...evidenceContext,
    key: v.string(),
    explicitlyRequested: v.literal(true),
    origin: v.object({
      topicId: v.id("knowledgeTopics"),
      memberId: v.id("knowledgeMembers"),
      version: v.number(),
      excluded: v.boolean(),
    }),
    change: v.union(
      v.object({ kind: v.literal("exclude") }),
      v.object({ kind: v.literal("restore") }),
      v.object({
        kind: v.literal("move"),
        destination: v.object({
          topicId: v.id("knowledgeTopics"),
          version: v.number(),
        }),
      }),
    ),
  },
  returns: filingReceiptValue,
  handler: async (ctx, args) => {
    const input = filingInput.parse(args);
    const a = await authorizeEvidence(ctx, args);
    const topic = await currentTopic(
      ctx,
      a.organization._id,
      args.origin.topicId,
    );
    const inputHash = await digest(JSON.stringify(input));
    const old = await ctx.db
      .query("assistantLibraryCommands")
      .withIndex("by_request", (q) =>
        q
          .eq("grantId", a.grant._id)
          .eq("grantVersion", a.grant.version)
          .eq("key", args.key),
      )
      .unique();
    if (old) {
      ensure(
        old.expiresAt > Date.now(),
        "APPROVAL_STALE",
        "The retained filing receipt expired. Review current state.",
      );
      ensure(
        old.inputHash === inputHash,
        "INVALID_INPUT",
        "Keep this request key bound to its original idea filing.",
      );
      if (old.evidence?.destination)
        await currentTopic(
          ctx,
          a.organization._id,
          old.evidence.destination.topicId,
        );
      return evidenceReceipt(old);
    }
    ensure(
      topic.version === args.origin.version,
      "APPROVAL_STALE",
      "The origin topic changed. Review its current filing.",
    );
    const member = await ctx.db.get(args.origin.memberId);
    const ref = args.reference;
    ensure(
      member &&
        !member.retainedHistory &&
        member.organizationId === a.organization._id &&
        member.topicId === topic._id &&
        member.sourceId === ref.sourceId &&
        member.generation === ref.generation &&
        member.revision === ref.revision &&
        member.insightId === ref.insightId &&
        member.excluded === args.origin.excluded,
      "APPROVAL_STALE",
      "The exact idea filing changed. Review it before saving.",
    );
    ensure(
      args.change.kind === "restore" ? member.excluded : !member.excluded,
      "INVALID_INPUT",
      "Review the current filing before changing it.",
    );
    await limit(ctx, `assistant-library:${a.actor._id}:${a.client.id}`, 20);
    const originRows = await membersForCount(ctx, topic._id, ref.sourceId);
    const before = originRows.filter((row) => !row.excluded).length;
    const excluded = args.change.kind !== "restore";
    let destination:
      | {
          topicId: Id<"knowledgeTopics">;
          memberId: Id<"knowledgeMembers">;
          version: number;
        }
      | undefined;
    if (args.change.kind === "move") {
      const target = await currentTopic(
        ctx,
        a.organization._id,
        args.change.destination.topicId,
      );
      ensure(
        target._id !== topic._id,
        "INVALID_INPUT",
        "Choose a different topic.",
      );
      ensure(
        target.version === args.change.destination.version,
        "APPROVAL_STALE",
        "The destination topic changed. Reload topics.",
      );
      const rows = await membersForCount(ctx, target._id, ref.sourceId);
      const matches = rows.filter(
        (row) =>
          row.generation === ref.generation &&
          row.revision === ref.revision &&
          row.insightId === ref.insightId,
      );
      ensure(
        matches.length <= 1,
        "INVALID_INPUT",
        "Review duplicate filings in the protected library.",
      );
      const existing = matches[0];
      let memberId: Id<"knowledgeMembers">;
      if (existing) {
        memberId = existing._id;
        await ctx.db.patch(memberId, {
          excluded: false,
          manual: true,
          updatedAt: Date.now(),
        });
      } else {
        memberId = await ctx.db.insert("knowledgeMembers", {
          organizationId: a.organization._id,
          topicId: target._id,
          sourceId: ref.sourceId,
          generation: ref.generation,
          revision: ref.revision,
          insightId: ref.insightId,
          ...(member.sourceTitle ? { sourceTitle: member.sourceTitle } : {}),
          excluded: false,
          manual: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      const targetBefore = rows.filter((row) => !row.excluded).length;
      await touchFiling(
        ctx,
        target,
        targetBefore,
        targetBefore + Number(!existing || existing.excluded),
      );
      destination = {
        topicId: target._id,
        memberId,
        version: target.version + 1,
      };
    }
    await ctx.db.patch(member._id, {
      excluded,
      manual: true,
      updatedAt: Date.now(),
    });
    await touchFiling(ctx, topic, before, before + (excluded ? -1 : 1));
    const id = await ctx.db.insert("assistantLibraryCommands", {
      organizationId: a.organization._id,
      actor: a.actor._id,
      clientId: a.client.id,
      grantId: a.grant._id,
      grantVersion: a.grant.version,
      key: args.key,
      inputHash,
      topicId: topic._id,
      operation: "file",
      topicVersion: topic.version + 1,
      layoutVersion: topic.layoutVersion ?? 0,
      evidence: {
        ...ref,
        memberId: member._id,
        kind: args.change.kind,
        excluded,
        ...(destination ? { destination } : {}),
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 86400000,
    });
    await audit(
      ctx,
      a.organization._id,
      a.actor._id,
      `assistant.idea_${args.change.kind}`,
      member._id,
    );
    const saved = await ctx.db.get(id);
    ensure(saved, "INVALID_INPUT", "The filing receipt is unavailable.");
    // No synthesis, media analysis, coding, sharing or publication is dispatched.
    return evidenceReceipt(saved);
  },
});
