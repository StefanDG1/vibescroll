import { releaseUnstarted } from "./personalMediaState";
import { query } from "./_generated/server";
import { mutation } from "./lib/projectedMutations";
import { v } from "convex/values";
import { access, fail, limit, recentAuthentication, writeAccess } from "./lib";
import { ensure } from "../packages/policy";
import { settle } from "./product";
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, a) => {
    const { actor } = await access(ctx, a.organizationId);
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", a.organizationId))
      .collect();
    return rows.map(
      ({ codeHash: _codeHash, credentialHash: _credentialHash, ...d }) => ({
        ...d,
        personalOwned: d.owner === actor._id,
        pairingActive: d.state === "pending" && d.expiresAt > Date.now(),
        personalOnline:
          d.owner === actor._id &&
          d.state === "paired" &&
          (d.personalSeenAt ?? 0) > Date.now() - 60000,
        personalModels: d.owner === actor._id ? d.personalModels : undefined,
        subscriptionCapabilities:
          d.owner === actor._id ? d.subscriptionCapabilities : undefined,
        personalInputProtocols:
          d.owner === actor._id ? d.personalInputProtocols : undefined,
      }),
    );
  },
});
export const start = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    fingerprint: v.string(),
    codeHash: v.string(),
  },
  handler: async (ctx, a) => {
    const u = await writeAccess(ctx, a.organizationId, ["owner", "admin"]);
    await recentAuthentication(ctx);
    await limit(ctx, `pair:${u.actor._id}`, 3);
    ensure(
      /^[a-f0-9]{64}$/.test(a.fingerprint) &&
        /^[a-f0-9]{64}$/.test(a.codeHash) &&
        a.name.length <= 80,
      "INVALID_INPUT",
      "Invalid device challenge.",
    );
    return ctx.db.insert("devices", {
      ...a,
      owner: u.actor._id,
      credentialHash: "",
      state: "pending",
      expiresAt: Date.now() + 600000,
      lastSeenAt: 0,
      capabilities: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
export const approve = mutation({
  args: {
    id: v.id("devices"),
    fingerprint: v.string(),
    credentialHash: v.string(),
  },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.id);
    if (!d) fail("Device unavailable.");
    const u = await writeAccess(ctx, d.organizationId, ["owner", "admin"]);
    await recentAuthentication(ctx);
    ensure(
      d.owner === u.actor._id &&
        d.fingerprint === a.fingerprint &&
        d.state === "pending" &&
        d.expiresAt > Date.now() &&
        /^[a-f0-9]{64}$/.test(a.credentialHash),
      "PAIRING_INVALID",
      "The device challenge is invalid or expired.",
    );
    ensure(
      !(await ctx.db
        .query("devices")
        .withIndex("by_credential", (q) =>
          q.eq("credentialHash", a.credentialHash),
        )
        .first()),
      "PAIRING_INVALID",
      "Credential is already bound to a device.",
    );
    await ctx.db.patch(d._id, {
      capabilities: ["protocol:1.0.0"],
      state: "paired",
      credentialHash: a.credentialHash,
      codeHash: "",
      updatedAt: Date.now(),
    });
  },
});
export const revoke = mutation({
  args: { id: v.id("devices") },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.id);
    if (!d) fail("Device unavailable.");
    await writeAccess(ctx, d.organizationId, ["owner"]);
    await ctx.db.patch(d._id, {
      state: "revoked",
      credentialHash: "",
      capabilities: [],
      personalModels: undefined,
      personalSeenAt: undefined,
      personalProfileBinding: undefined,
      subscriptionCapabilities: undefined,
      personalInputProtocols: undefined,
    });
    for (const state of ["preparing", "queued", "running"]) {
      const sources = await ctx.db
        .query("sources")
        .withIndex("by_personal_device_state", (q) =>
          q
            .eq("personalAnalysis.deviceId", d._id)
            .eq("personalAnalysis.state", state),
        )
        .collect();
      for (const source of sources) {
        const job = source.personalAnalysis!;
        await releaseUnstarted(
          ctx,
          source.organizationId,
          source._id,
          job.generation,
        );
        await settle(
          ctx,
          source.organizationId,
          `source:${source._id}:${job.generation}`,
          0,
        );
        await ctx.db.patch(source._id, {
          state: "failed",
          generation: source.generation + 1,
          personalAnalysis: { ...job, state: "canceled" },
          error:
            "The paired computer was revoked. Plan usage already started may still count.",
          updatedAt: Date.now(),
        });
      }
    }
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_org", (q) => q.eq("organizationId", d.organizationId))
      .collect();
    for (const r of runs)
      if (r.deviceId === d._id && r.state !== "completed")
        await ctx.db.patch(r._id, {
          state: "canceled",
          generation: r.generation + 1,
        });
  },
});
