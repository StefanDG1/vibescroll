import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assistantGrant } from "./lib/assistantPrincipal";
import { checkTopicParent } from "./lib/topicStructure";
import { ensure, containsSecret } from "../packages/policy";
import { categoryName } from "../packages/categories";
import { audit, limit } from "./lib";
import { digest } from "./product";
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
