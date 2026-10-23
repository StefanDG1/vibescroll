"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { creatorConfiguration } from "./lib/creatorPolicy";
import { createCreatorTransport } from "../packages/providers/creator-transport";
import { normalizeApifyDiscovery } from "../packages/providers/social-discovery";
import { discoverBounded } from "../packages/social/discovery";

/** Default dormant. The existing cron may call this only after operator review. */
export const dispatch = internalAction({
  args: {},
  handler: async (ctx): Promise<{ attempted: number; pending: boolean }> => {
    if (!creatorConfiguration()?.transport || !process.env.APIFY_TOKEN)
      return { attempted: 0, pending: true };
    const due = await ctx.runQuery(internal.creatorDiscovery.due, {
      transportOnly: true,
    });
    let attempted = 0;
    // Serial, bounded five watches. A failed/unknown attempt stops this dispatch.
    for (const candidate of due) {
      const result = await ctx.runAction(
        internal.creatorDiscoveryActions.check,
        {
          id: candidate.id,
          expectedVersion: candidate.version,
          expectedGeneration: candidate.generation,
        },
      );
      attempted++;
      if (result.unknown) break;
    }
    return { attempted, pending: false };
  },
});

export const check = internalAction({
  args: {
    id: v.id("creatorWatches"),
    expectedVersion: v.number(),
    expectedGeneration: v.number(),
  },
  handler: async (
    ctx,
    a,
  ): Promise<{ unknown: boolean; observed?: number; incomplete?: boolean }> => {
    const config = creatorConfiguration(),
      token = process.env.APIFY_TOKEN;
    if (!config?.transport || !token || /[\r\n]/.test(token))
      return { unknown: false };
    // Do not consume a reservation for a platform without a reviewed actor.
    const candidates = await ctx.runQuery(internal.creatorDiscovery.due, {
      transportOnly: true,
    });
    if (
      !candidates.some(
        (row) =>
          row.id === a.id &&
          row.version === a.expectedVersion &&
          row.generation === a.expectedGeneration,
      )
    )
      return { unknown: false };
    const preflight = await ctx.runMutation(
      internal.creatorDiscovery.preflight,
      a,
    );
    if (preflight !== "ready") return { unknown: preflight === "unknown" };
    const claim = await (async () => {
      try {
        return await ctx.runMutation(internal.creatorDiscovery.claim, {
          id: a.id,
          expectedVersion: a.expectedVersion,
          expectedGeneration: a.expectedGeneration,
          requireTransport: true,
        });
      } catch (error) {
        // Membership, policy or another claim may change after preflight.
        // Unknown control-plane failures still propagate; they grant no retry.
        const current = await ctx.runMutation(
          internal.creatorDiscovery.preflight,
          a,
        );
        if (current === "ready") throw error;
        // A lost claim acknowledgement is indistinguishable from a competing
        // current claim. Keep its hold and stop this dispatch either way.
        return current === "busy" ? ("unknown" as const) : current;
      }
    })();
    if (typeof claim === "string") return { unknown: claim === "unknown" };
    const binding = {
      id: claim.id,
      generation: claim.generation,
      lease: claim.lease,
      reservationKey: claim.reservationKey,
    };
    const descriptor = claim.transport;
    if (
      !descriptor ||
      !descriptor.actors.some((row) => row.platform === claim.platform)
    ) {
      await ctx.runMutation(internal.creatorDiscovery.retainUnknown, binding);
      return { unknown: true };
    }
    const transport = createCreatorTransport({
      descriptor,
      platform: claim.platform,
      creatorId: claim.creatorId,
      canonical: claim.canonical,
      token,
      // Content work uses the original 60s lease. Only owned-resource cleanup
      // may use this additional bounded 24s window; it grants no new work.
      deadline: claim.deadline + 24_000,
      workDeadline: claim.deadline,
      before: async (operation) => {
        await ctx.runMutation(internal.creatorDiscovery.operation, {
          ...binding,
          operation,
        });
      },
      recordRun: async (run) => {
        await ctx.runMutation(internal.creatorDiscovery.recordRun, {
          ...binding,
          run,
        });
      },
    });
    let cleanupConfirmed = false;
    try {
      let run = await transport.start();
      for (
        let i = 0;
        i < 3 &&
        ["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(run.status);
        i++
      )
        run = await transport.status();
      if (run.status !== "SUCCEEDED") throw Error("CREATOR_RUN_NOT_SUCCEEDED");
      let offset = 0;
      const result = await discoverBounded(
        {
          enabled: true,
          provider: claim.provider,
          platform: claim.platform,
          creatorId: claim.creatorId,
          rights: claim.rights,
          now: Date.now(),
          deadline: claim.deadline,
          cursor: null,
          reservation: {
            key: claim.reservationKey,
            provider: claim.provider,
            expiresAt: claim.deadline,
            maximumUsdMicros: claim.maximumUsdMicros,
            includesMinimumRetriesStorageAndLag: true,
            state: "reserved",
          },
        },
        async ({ cursor, signal }) => {
          if (signal.aborted || cursor !== (offset ? String(offset) : null))
            throw Error("DISCOVERY_CURSOR_STALLED");
          const page = await transport.page(offset);
          const normalized = await normalizeApifyDiscovery(page.rows, {
            platform: claim.platform,
            creatorId: claim.creatorId,
            observedAt: Date.now(),
          });
          if (normalized.issues.some((issue) => issue.code === "invalid_item"))
            throw Error("CREATOR_OUTPUT_REVIEW_REQUIRED");
          offset += page.rows.length;
          // This is dataset pagination only, never a claim about creator coverage.
          return {
            posts: normalized.posts,
            cursor: page.rows.length < 40 ? null : String(offset),
            complete: page.rows.length < 40,
            responseBytes: page.bytes,
          };
        },
      );
      if (!result.complete) throw Error("CREATOR_DATASET_PARTIAL");
      cleanupConfirmed = (await transport.cleanup()).confirmed;
      await ctx.runMutation(internal.creatorDiscovery.recordCleanup, {
        ...binding,
        confirmed: cleanupConfirmed,
      });
      if (!cleanupConfirmed) throw Error("CREATOR_CLEANUP_UNKNOWN");
      // Recheck current rights, membership, lease and complete policy hash in
      // each existing commit. Never launch analysis or paid inference here.
      for (
        let offset = 0;
        offset < Math.max(1, result.posts.length);
        offset += 10
      ) {
        await ctx.runMutation(internal.creatorDiscovery.commit, {
          ...binding,
          posts: result.posts.slice(offset, offset + 10),
          complete: false,
          cursor: `apify-snapshot:${run.id}`,
          finalBatch: offset + 10 >= result.posts.length,
          pauseIncomplete: !descriptor.allowIncompleteSnapshots,
        });
      }
      return {
        unknown: false,
        observed: result.posts.length,
        incomplete: true,
      };
    } catch {
      // No supplier/model error or upstream payload is copied into product logs.
      // Cleanup is best effort within the same one-attempt physical counters.
      if (!cleanupConfirmed) {
        try {
          cleanupConfirmed = (await transport.cleanup()).confirmed;
        } catch {
          /* unknown remains held */
        }
        try {
          await ctx.runMutation(internal.creatorDiscovery.recordCleanup, {
            ...binding,
            confirmed: cleanupConfirmed,
          });
        } catch {
          /* original durable pending receipt remains */
        }
      }
      await ctx.runMutation(internal.creatorDiscovery.retainUnknown, binding);
      return { unknown: true };
    }
  },
});
