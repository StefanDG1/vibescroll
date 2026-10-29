import { z } from "zod";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ensure } from "../../packages/policy";

const allowanceSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    subject: z.string().min(1).max(120),
    maximumJobs: z.number().int().min(1).max(100),
    startsAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (a) => a.expiresAt > a.startsAt && a.expiresAt - a.startsAt <= 7 * 86400000,
  );

// Admission is part of the same mutation as job creation. A refused approval
// rolls back its counter, and queued replays never reach this helper.
export async function admitCloudMediaJob(
  ctx: MutationCtx,
  actor: Doc<"users">,
) {
  const now = Date.now();
  const configured = process.env.WORK_CLOUD_ADMISSION_JSON;
  let allowance: z.infer<typeof allowanceSchema> | undefined;
  if (configured !== undefined) {
    let parsed: unknown;
    try {
      if (configured.length <= 4096) parsed = JSON.parse(configured);
    } catch {
      /* Invalid operator configuration must fail closed. */
    }
    const result = allowanceSchema.safeParse(parsed);
    ensure(
      result.success,
      "SETUP_REQUIRED",
      "Cloud worker allowance is unavailable.",
    );
    if (result.data.subject === actor.subject) allowance = result.data;
  }
  if (allowance) {
    ensure(
      now >= allowance.startsAt && now < allowance.expiresAt,
      "QUOTA_EXCEEDED",
      "The current Cloud worker allowance has ended.",
    );
    const key = `work-cloud-admission:${actor._id}:${allowance.id}`;
    const row = await ctx.db
      .query("limits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    ensure(
      !row || row.count < allowance.maximumJobs,
      "QUOTA_EXCEEDED",
      "The current Cloud worker allowance is used. Saved results remain available.",
    );
    // limits.window uses MINUTES. Keep the durable allowance through its expiry;
    // the existing minute-based maintenance job can remove it only afterwards.
    const counter = {
      window: Math.ceil(allowance.expiresAt / 60000),
      count: (row?.count ?? 0) + 1,
    };
    if (row) await ctx.db.patch(row._id, counter);
    else await ctx.db.insert("limits", { key, ...counter });
  }
  const key = `work-cloud-mcp-hour:${actor._id}`;
  const hour = Math.floor(now / 3600000);
  const window = hour * 60;
  const row = await ctx.db
    .query("limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  // Preserve a current legacy hours-valued counter while migrating its units.
  const count =
    row && (row.window === window || row.window === hour) ? row.count : 0;
  const maximum = allowance ? Math.max(6, allowance.maximumJobs) : 6;
  ensure(
    count < maximum,
    "QUOTA_EXCEEDED",
    "The hourly Cloud worker limit is reached.",
  );
  const counter = { window, count: count + 1 };
  if (row) await ctx.db.patch(row._id, counter);
  else await ctx.db.insert("limits", { key, ...counter });
}
