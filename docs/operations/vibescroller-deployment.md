# Deploy VibeScroller

Mode: how-to. Current host: Vercel Pro, checked October 2, 2026. Older Netlify and Worker deployments are historical; follow this procedure for the serving application.

October 22 publication hold: [ADR 114](../adr/114-budget-gated-launch-rollout.md) temporarily disables automatic main Git deployment and production-domain assignment. Full CI builds remain enabled. Follow [the launch rollout procedure](launch-20261022-rollout.md) to verify backend compatibility and spending bounds before removing either hold. The normal automatic deployment step below applies after that controlled resumption.

## Current production setup

- Repository: `StefanDG1/vibescroll`, production branch `main`.
- Vercel project: [vibe-scroller](https://vercel.com/stefandg1s-projects/vibe-scroller), root `apps/starter`, shared workspace files included, Node 24, pnpm 12.3.4 and Frankfurt functions.
- Public domain: `https://scroll.companynerve.com`. Namecheap retains parent DNS and mail; only scroll points to Vercel's verified target `a987f11417c888aa.vercel-dns-017.com.`.
- Convex production: `bold-lemur-667`. Dedicated development: `resolute-ladybug-999`.
- WorkOS production callback: `https://scroll.companynerve.com/callback`. The cookie is `__Host-vibescroller-production`, Secure, HttpOnly, SameSite Lax and host-bound.
- Private R2 uses the explicit EU-jurisdiction endpoint with public bucket access disabled. Production server credentials stay in Vercel and Convex stores. The legacy bucket name does not make its contents public or upstream data.

Production secrets are scoped only to Production. Generated deployment URLs and previews require Vercel authentication. Local ChatGPT credentials and runner configurations stay on the paired computer. Never copy production secrets into previews, source, public Next variables or coding tasks.

## Publish an update

1. Use Node 24 and the pinned package manager. Run `pnpm install --frozen-lockfile` when the lockfile changes, then `pnpm check`, `pnpm audit --prod --audit-level high`, formatting and `git diff --check`.
2. Review the exact staged changes and run a redacted secret scan on their patch. Keep private ZIPs, PDFs, media, diagnostics, keys, environment files and runner configurations ignored. Preserve failed/skipped checks in [the implementation record](../implementation-status.md).
3. For backend changes, confirm the selected project and deployment, then run `pnpm exec convex deploy --yes` against the dedicated production deployment. Development codegen is not a production deployment. Review schema compatibility and preserve active jobs and ledgers.
4. Commit and push reviewed source to main. The connected Vercel project builds and deploys on Linux using a fixed Basic machine and normal queued concurrency. Documentation-only updates may skip deployment, comparing against the last successful application build; application, policy and unknown changes still build. See [ADR 033](../adr/033-basic-builds-and-documentation-skips.md). Do not deploy a partial Windows adapter package or weaken its security to fix Windows symlink packaging.
5. Confirm required GitHub CI, the immutable alpha release and Vercel success at the exact commit. Check the Account build version and the real domain, not an old hidden tab. Main updates follow [the versioning policy](../VERSIONING.md).
6. Verify affected authenticated browser journeys, private response headers and relevant failure states. Frontend and backend verification are separate. Record environment, timestamp, commit and result.

Use [Vercel migration and rollback details](vercel-migration.md) for project settings and protection. Restore a known frontend deployment if necessary; that does not reverse database schema changes, running jobs, external PRs, reservations or charges. Reconcile uncertain work separately.

## Personal runner

Use the ignored production runner configuration described in [the personal guide](personal-analysis-runner.md). Start one runner, keep the computer awake, and verify its heartbeat in Connections. No inbound port or uploaded OpenAI OAuth token is needed. Personal audio/vision analysis and authorized coding are separate permissions; the failed Windows coding isolation gate remains closed.

## Billing and publication

The dedicated VibeScroller live Stripe account and its separate Managed Payments sandbox are not the Education account. Verify matching account, key mode, all six subscription prices, both top-ups, portal, signed webhook and the selected route before use. Live checkout is enabled after the October 3 owner policy approval and verified unpaid production handoff. Maintain the exact release controls and evidence in [the release record](paid-release-2026-10-03.md). Do not replace Managed Payments with direct billing silently.

The selected launch scope permits individual and business purchases in markets where Stripe assumes applicable indirect-tax compliance; see ADR 039. Configure `STRIPE_MANAGED_MARKET=tax_covered` and account/mode-bound `STRIPE_MANAGED_COUNTRY_RULE_PROOF` after verifying the exact versioned Radar condition at 100% traffic, no enabled Allow bypass, and actual sandbox acceptance. Renew within 30 days and after rule or coverage changes. Stripe collects the actual billing address; the app omits an additional country selector. Historical `provider_supported` cannot activate live billing. Direct billing retains its separate policy. See [ADR 035](../adr/035-managed-tax-covered-markets.md).

The owner prohibits a real purchase/refund test. Sandbox cards and signed provider reconciliation provide the available payment evidence; record the omitted live test honestly. The [V1 readiness record](../V1-READINESS.md), [release checklist](../LAUNCH-CHECKLIST.md), [policy publication checklist](../../legal/POLICY-IMPLEMENTATION.md) and [accountant handover](operator-tax-and-publication.md) identify remaining work. A healthy production deployment is not paid V1 authorization or evidence of legal review.

For dependency security, preserve the raw pnpm audit result and run `node scripts/audit-dependencies.mjs outputs/audit-report-unique.json`. The dated exact-byte mitigation record can classify a known locally patched advisory; it cannot hide new findings, a changed patch, expiry or inconsistent counts. A passing triage is not a claim of zero registry advisories. Required CI runs the same audit policy after complete checks. See ADR 042 for the current braces mitigation and November 2 recheck deadline.

October 3 checkout configuration: APP_URL must be explicitly set in both the frontend and selected Convex deployment to https://scroll.companynerve.com. The backend does not inherit Vercel's variable. Readiness refuses absent/noncanonical origins, and billing validates them before provider calls or checkout-intent writes. Live mode requires HTTPS; sandbox HTTP is limited to loopback. Keep LIVE_CHECKOUT_ENABLED=false during a billing fix and enable it only after the matching backend/frontend and applicable evidence are verified. Preserve unknown attempts; an operator may clear only a matching known-unstarted or provider-expired lock after authoritative provider reconciliation. A clear does not grant entitlement or establish payment.
