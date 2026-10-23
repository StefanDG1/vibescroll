import { mutation, internalMutation } from "./lib/projectedMutations";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifySandboxRequest } from "../packages/policy/sandbox-broker";
import {
  snapshotAuthoritySchema,
  type SnapshotAuthority,
} from "../packages/providers/preparation-runtime";

// Machine identity within our trusted broker boundary. Customer identity and
// execution approval remain enforced by the existing job mutations/actions.
export const consume = mutation({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, a) => {
    if (
      process.env.SANDBOX_BRIDGE_ENABLED !== "true" ||
      process.env.RESTORE_LOCK === "true"
    )
      return false;
    const request = await verifySandboxRequest(
      a.body,
      a.signature,
      process.env.SANDBOX_BRIDGE_SECRET ?? "",
    );
    if (!request) return false;
    const existing = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_key", (q) =>
        q.eq("provider", "sandbox-broker").eq("key", request.nonce),
      )
      .unique();
    if (existing) return false;
    const id = await ctx.db.insert("webhookReceipts", {
      provider: "sandbox-broker",
      key: request.nonce,
      at: Date.now(),
      state: "consumed",
    });
    await ctx.scheduler.runAfter(60000, internal.sandboxBroker.expire, { id });
    const rows = await ctx.db.query("sandboxToolSnapshots").take(3);
    if (!rows.length) return true;
    if (
      rows.length > 2 ||
      new Set(rows.map((row) => row.kind)).size !== rows.length
    )
      return false;
    const snapshots: Record<string, { snapshotId: string; expiresAt: number }> =
      {};
    const snapshotAuthorities: Record<string, SnapshotAuthority> = {};
    for (const row of rows) {
      if (
        row.projectId !== process.env.VERCEL_SANDBOX_PROJECT_ID ||
        row.teamId !== process.env.VERCEL_SANDBOX_TEAM_ID
      )
        return false;
      snapshots[row.kind] = {
        snapshotId: row.snapshotId,
        expiresAt: row.expiresAt,
      };
      const authority = snapshotAuthoritySchema.safeParse({
        kind: row.kind,
        snapshotId: row.snapshotId,
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
        parentSnapshotId: row.parentSnapshotId ?? null,
        projectId: row.projectId,
        teamId: row.teamId,
      });
      if (!authority.success) return false;
      snapshotAuthorities[row.kind] = authority.data;
    }
    return { snapshots, snapshotAuthorities };
  },
});
export const expire = internalMutation({
  args: { id: v.id("webhookReceipts") },
  handler: async (ctx, a) => {
    const receipt = await ctx.db.get(a.id);
    if (
      receipt?.provider === "sandbox-broker" &&
      receipt.at < Date.now() - 30000
    )
      await ctx.db.delete(a.id);
  },
});
