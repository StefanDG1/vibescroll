# Roll out the October 22 implementation

Mode: how-to. This is the backend-first rollout procedure for the five launch PRs, not a claim of production acceptance. Follow [the acceptance matrix](../launch-plan/2026-10-22/ACCEPTANCE.md), [the unattended budget controls](../launch-plan/2026-10-22/UNATTENDED-RUN.md) and [the deployment runbook](vibescroller-deployment.md).

## Integrate one complete version

The owner subsequently authorized merging the launch PRs and requested production operation. The shared additional Convex ceiling remains US$2 for the entire run, with no other new spending. Provider, privacy, signing, independent-user and payment gates remain in force. The unrelated dependency PR 117 is outside this launch stack.

Merge the presentation PR into product, then product into companion, companion into sources, and sources into foundation. Require the updated parent's exact-head CI after each merge. The final main integration retains the temporary [ADR 114 publication hold](../adr/114-budget-gated-launch-rollout.md) until the compatible backend and spending bounds pass. This yields one complete main update while preserving the serving application. Keep launch-branch and main Git deployment suppression during the hold. Full GitHub CI builds continue. Preserve fixed Basic queued Vercel machinery for the eventual authorized rollout.

## Verify the backend before publishing the frontend

The Vercel build command builds the web application; it does not deploy Convex. The new Console calls `setupJourney.status` immediately. Publishing that frontend against the previous backend can produce missing-function errors. New source/public routes also require the new functions and schema.

The root check also runs an offline regression against the installed Convex CLI bundler for the app, schema and every discovered component. It never runs the CLI entry point, authentication or push code. This caught a JSON import-attribute incompatibility that the web build missed. The shared acquisition runtime now receives the canonical downloader version through a validator factory. Convex and native Node load the same JSON at their respective entry points. Native companion imports and archive checks must pass alongside backend bundling.

1. Confirm the exact reviewed commit, clean checkout, production target `bold-lemur-667`, valid supported authentication, actual production gates, and a conservative whole-operation cost reservation within the remaining shared allowance. Do not assume local commands target a local database or that included allowances remain available. Do not change the team-wide disable limit.
2. Review active legacy matching jobs before changing their handler. Prefer allowing known in-flight work to finish on its original compatible backend. A pre-upgrade job without actor/generation/revision authority cannot create a proposal under the new handler. Preserve measured settlement and unknown holds; reconcile its actual outcome. Never invent historical actor authority or release a dispatched reservation merely to clear a queue. A subsequent attempt requires a fresh explicit quote and authorization.
3. Review schema/index compatibility and background work. The launch schema additions are optional fields or new tables; no application-wide backfill is required. Crons are unchanged. Retain the actual existing provider gates; do not enable direct sources, public discovery, cloud inference or live payment observation as part of deployment.
4. Deploy the reviewed compatible backend using the supported CLI and the named production target, following the general runbook. Record its exact source commit and outcome separately from the later main merge commit. Code generation or a successful web build is not a backend deployment.
5. Make a bounded authenticated read of an existing legacy Library view and the new setup status. Record actual backend responses without private content. Do not trigger analysis, imports, matching, grants, billing or public seeding as a canary. A static `/api/health` 200 proves only frontend reachability/version, not backend compatibility.
6. After the final main merge, verify main CI and its immutable alpha release. Vercel publication remains held until its build usage is verified to incur no additional charge or the owner authorizes that spend. Remove the temporary main Git suppression only after backend compatibility and both providers' budget requirements pass. Build and verify the exact frontend commit under the domain promotion hold. Promote that exact build, verify the canonical version and affected authenticated new/legacy journeys, then restore the intended automatic publication policy. Keep actual failed/skipped observations distinct from local fixtures.

If a conservative hosted bound or required authentication is unavailable, leave that dependent rollout pending and continue independent integration/review. Do not ship the new frontend against an incompatible backend to satisfy a merge checklist.

## Retention and interrupted candidate recovery

New provider revisions atomically record their scheduled retention deadline. If expiry runs during `RESTORE_LOCK`, it retains one minute-spaced revision-specific retry. On unlock, the callback checks the exact current pointer/generation, scrubs expired raw/evidence bytes, and continues bounded derived redaction without removing a later recovered generation. A locked derived-redaction continuation reschedules the same bounded arguments and cursor. Reads remain denied after expiry while the operator lock is active.

For a candidate deployment that already consumed an old expiry callback while locked, identify its exact affected source IDs from operator records. Run internal `sourceAcquisition.normalizeRetention({sourceId})` separately for each affected source only after reviewing target and cost. It reads at most 26 indexed rows to enforce a maximum of 25 revisions, rejects oversized history before writes, and atomically deduplicates future expiry callbacks. It does not scan the entire database. Removed tombstones contain no raw revision bytes. If an older derived chain was already consumed, resume internal `knowledge.redactDerived` with its exact organization, source, generation bound, section and cursor. Do not restore old content or start an unbounded global repair.

No old live direct-source candidate data has been verified by the local recovery fixtures. Production repair is conditional on actual affected records; it is not a mandatory migration or a permission to read every source.

Typed raw export now also checks the current provider gate/eligibility, retained deadline and policy evidence before exporting either the revision or source payload. A retained copy alone does not preserve permission after the provider policy changes. Explicit supplied text and supported legacy exports retain their existing behavior.

## Rollback and acceptance

Prefer a frontend rollback while retaining the compatible new backend. The new dashboard projection may write `sourceAuthorityVersion: 2`; the baseline schema only accepts version 1. Rolling the backend schema back after new writes is unsafe without a separately reviewed compatibility procedure. A frontend rollback also does not undo jobs, reservations, publications or financial settlement.

All 16 work packages have implementation and local evidence in the matrix. Live provider quality/cost, signed distribution and real installation, independent people/devices, rights-cleared public starter content, and applicable legal/payment acceptance remain separate requirements. Merging or deploying code cannot substitute for those observations or justify opening a gate.
