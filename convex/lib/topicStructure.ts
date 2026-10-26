import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";

export async function checkTopicParent(
  ctx: QueryCtx,
  topic: Doc<"knowledgeTopics">,
  initialParent: Id<"knowledgeTopics"> | null,
) {
  let parentId = initialParent;
  const seen = new Set<string>([topic._id]);
  for (let depth = 0; parentId; depth++) {
    ensure(
      depth < 12 && !seen.has(parentId),
      "INVALID_INPUT",
      "Choose a parent without a cycle, within twelve levels.",
    );
    seen.add(parentId);
    const parent = await ctx.db.get(parentId);
    ensure(
      parent &&
        parent.organizationId === topic.organizationId &&
        !parent.redirect &&
        parent.state !== "deleted",
      "FORBIDDEN",
      "Parent topic unavailable.",
    );
    parentId = parent.parentId ?? null;
  }
}
