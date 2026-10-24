import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
// Each watch owns its daily due time. The bounded dispatcher only exists in a
// deployment whose operator separately enabled the reviewed supplier rollout.
if (process.env.CREATOR_DISCOVERY_CRON_ENABLED === "true")
  crons.interval(
    "Discover reviewed public creators",
    { hours: 1 },
    internal.creatorDiscoveryActions.dispatch,
    {},
  );
crons.interval(
  "Recover full library scans",
  { minutes: 5 },
  internal.usageMaintenance.recoverLibraryScans,
  {},
);
crons.interval(
  "Advance reviewed improvements",
  { minutes: 5 },
  internal.usageMaintenance.recoverImprovements,
  {},
);
for (const kind of ["media", "coding"] as const) {
  crons.interval(
    `Renew clean ${kind} tool snapshot`,
    { hours: 6 },
    internal.toolMaintenance.renew,
    { kind },
  );
}
crons.daily(
  "Clean ephemeral records",
  { hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.cleanup,
);
crons.interval(
  "Reconcile subscriptions",
  { hours: 1 },
  internal.usageMaintenance.reconcileBilling,
  {},
);
crons.interval(
  "Reconcile draft PRs",
  { minutes: 15 },
  internal.usageMaintenance.reconcilePRs,
  {},
);
crons.interval(
  "Expire objects and apply deletion tombstones",
  { hours: 1 },
  internal.privacy.sweep,
  {},
);
crons.interval(
  "Reconcile reviewed issues",
  { minutes: 15 },
  internal.issues.reconcilePage,
  {},
);
crons.interval(
  "Recover knowledge dispatch",
  { minutes: 5 },
  internal.knowledge.recoverPage,
  {},
);
crons.interval(
  "Recover and expire scoped Events",
  { minutes: 1 },
  internal.assistantEvents.recover,
  {},
);
export default crons;
