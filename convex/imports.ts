import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { limit, audit, writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import { parseLinkImport } from "../packages/imports";
import { captureOne, queueLinkPreview } from "./product";

export const links = mutation({
  args: {
    organizationId: v.id("organizations"),
    key: v.string(),
    format: v.union(v.literal("csv"), v.literal("json")),
    text: v.string(),
    rightsAttested: v.boolean(),
  },
  handler: async (ctx, a) => {
    const actor = await writeAccess(ctx, a.organizationId, [
      "owner",
      "admin",
      "member",
    ]);
    await limit(ctx, `link-import:${actor.actor._id}`, 3);
    ensure(
      a.rightsAttested && a.key.length >= 8 && a.key.length <= 80,
      "RIGHTS_REQUIRED",
      "Confirm the imported links may be saved.",
    );
    const rows = parseLinkImport(a.text, a.format);
    const entries: {
      row: number;
      status: string;
      sourceId?: string;
      accepted?: boolean;
      message?: string;
    }[] = [];
    for (const row of rows) {
      if (row.problem || !row.url) {
        entries.push({ row: row.row, status: row.problem ?? "invalid" });
        continue;
      }
      const old = await ctx.db
        .query("sources")
        .withIndex("by_canonical", (q) =>
          q.eq("organizationId", a.organizationId).eq("canonical", row.url!),
        )
        .unique();
      if (old && old.state !== "deleted") {
        await queueLinkPreview(ctx, old._id);
        entries.push({ row: row.row, status: "duplicate", sourceId: old._id });
        continue;
      }
      try {
        const id = await captureOne(
          ctx,
          {
            organizationId: a.organizationId,
            key: `${a.key}:${row.row}`,
            kind: "url",
            title: row.title ?? "Imported video link",
            url: row.url,
            rightsAttested: true,
          },
          true,
        );
        await ctx.db.patch(id, {
          ...(row.savedAt === undefined
            ? {}
            : { originalSavedAt: row.savedAt }),
          tags: row.collection ? [row.collection] : [],
        });
        entries.push({
          row: row.row,
          status: "waiting",
          accepted: true,
          sourceId: id,
          message:
            process.env.ACQUISITION_VERIFIED === "true"
              ? "Saved. Ready for permitted link retrieval."
              : "Saved. Link retrieval is not configured; permitted media can be attached.",
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("QUOTA_EXCEEDED"))
          entries.push({
            row: row.row,
            status: "waiting",
            accepted: false,
            message:
              "Workspace source allowance reached. This row was not saved.",
          });
        else throw error;
      }
    }
    await audit(
      ctx,
      a.organizationId,
      actor.actor._id,
      "source.imported",
      a.key,
    );
    return {
      entries,
      accepted: entries.filter((e) => e.accepted).length,
      duplicate: entries.filter((e) => e.status === "duplicate").length,
      invalid: entries.filter((e) => e.status === "invalid").length,
      unsupported: entries.filter((e) => e.status === "unsupported").length,
      waiting: entries.filter((e) => e.status === "waiting").length,
      analysisCreditsCharged: 0,
    };
  },
});
