# ADR 140: public main consolidation with a deployment hold

Status: authorized consolidation; exact-head verification and merge pending. Date: October 24, 2026.

## Decision

The owner requested finishing the current checks, merging all reviewed local/PR work into public main, stopping further feature work, and reporting implementation and production completion separately.

Consolidate the reviewed launch history with an ancestry-preserving merge. All current launch PR heads are ancestors of `beda8aee0f39ff864106961afb973d2e1807c21a`; earlier public-release alternatives were already integrated through PR141 and are not reintroduced. Leave unrelated dependency PRs untouched.

Temporarily add `git.deploymentEnabled.main=false` alongside the existing launch-branch rule in the starter Vercel configuration. This stricter, reversible hold supersedes the earlier feature-only suppression for this consolidation. It prevents merging the new frontend against the older serving backend. Keep full CI, dependency checks, both production builds, immutable versioning and prerelease publication. Preserve fixed Basic build machinery, normal queueing, domains, billing, provider flags and the existing live deployment.

The full backend fiscal proof and inherited index migrations remain incomplete within the cumulative US$3 cap. Main source publication does not deploy Convex. No manual deployment is dispatched by this decision. Verify the exact consolidation commit before merging and the merged main afterward. Remove the temporary hold only through a coordinated, verified and budgeted backend/frontend rollout.

## Cloud and payment direction

The owner does not want an extra discretionary wait for a separate OpenAI confirmation. A documented eligible official route does not need an additional owner-imposed confirmation step. This does not create missing transport, execution, cancellation or result-return capabilities, or authorize a route contrary to its actual provider contract. Keep supported account consent, isolation, quota, privacy, funding and publication controls. Do not describe the public Cloud path as working while its end-to-end implementation and evidence remain incomplete.

Stripe account access is authorized for VibeScroll and Exponential Education environments. Access authorization does not establish a successful live checkout or select the unfinished future allowance/offer terms. Preserve existing purchases and prices; do not invent account contexts, successful payments or a newly activated live offer.

## Evidence and stop checkpoint

The integrated candidate passed 1,761 tests with three hosted skips, all types, both builds and independent High review. PR152 and PR153 passed exact-head CI. Current native browser checks use actual components with synthetic in-memory replies and loopback-only resources; they do not establish production authority or model success.

The completion estimate uses eleven overlapping-scope-free C0-C10 domains. Approximately 70% of implementation is complete, with a judgment range of 65-80%. Roughly 10-20% of the expanded plan's production acceptance has evidence. These are milestone estimates, not test coverage or a claim that only that fraction of the existing app works. C11 and the explicitly deferred lifetime offer are excluded.

Production remains the compatible PR141 frontend `fba56d44c484260dc98e27174e943ee5ed21af51`, canonical deployment `dpl_FphHKWRbyef8xxqt18ozoxVxpFqs`, and backend `abfdeff6779a2fc7790d4441152117262965fe60`. Vercel control-plane inspection reconfirmed the canonical frontend before consolidation, without a production application request. Scheduled backup code is unchanged by the integrated candidate; no new backup/export run is requested.

Finish the current browser evidence, clean up only task-created test processes/tabs, publish the reviewed code, and stop feature work. Preserve the remaining-work plan and exact unresolved acceptance instead of marking the whole plan complete.
