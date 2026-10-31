# Start the implementation

Mode: how-to. Version: 1.0.0.

## Mandatory current product direction

Begin with [current accepted state](operations/CURRENT-STATE.md), the [owner request register](strategy/OWNER-REQUEST-REGISTER.md) and [continuation procedure](operations/CONTINUE-VIBESCROLL.md). Consult the [failure reference](operations/FAILURES-AND-RECOVERY.md) before diagnosing a symptom. These records distinguish later owner corrections, historical failures, current production evidence and still-open acceptance. The old repository-establishment steps below describe original setup; do not export a second repository when continuing the existing application.

Read [Saved posts, catalog access and individual Pro teams](strategy/POST-SUBSCRIPTIONS-CATALOG-AND-TEAMS.md) for the latest requested-post cache reuse, separate full-library add-on, individual member subscriptions/credits and precise settlement requirements.

For pricing/entitlements, read the [single Pro and credit-group plan](strategy/PRO-PRICING-AND-CREDITS.md): one hosted tier, Muse 1×, premium model bands, 300/500 comparison, digital-root-8 prices and a premium weekly interval. Runtime/Stripe migration is pending.

Read [Shared intelligence and the VibeScroll moat](strategy/SHARED-INTELLIGENCE-MOAT.md) and [Versioned link to insights](launch-plan/2026-10-23/VERSIONED-LINK-TO-INSIGHTS.md) until their acceptance ledgers are complete. They contain the owner's latest backend-first priorities and supersede older routine permission/privacy ceremony where explicitly stated. Keep planned, locally tested and live claims separate.

Also read [Simple setup, persistent results and proposal feedback](strategy/SIMPLE-SETUP-AND-CLOSED-LOOP-PROPOSALS.md) until accepted. It preserves the later owner screenshots and the required issue/PR completion loop.

## Establish the repository

1. Read [Decisions](decisions.md).
2. Read [PRD](PRD.md).
3. Inspect CompanyNerve's current README, status record, and export command.
4. Export the foundation into a new empty repository named `vibe-scroller`.
5. Add this package without overwriting upstream licence notices.
6. Record the source commit and lockfile in `docs/implementation-status.md`.

Do not alter the upstream CompanyNerve production application. Keep VibeScroller provider projects and secrets separate.

## Follow the reading order

Read [Architecture](architecture.md), [Data model](DATA-MODEL.md), [API contracts](API-CONTRACTS.md), and [State machines](STATE-MACHINES.md) before implementing backend behavior.

Read [Dashboard and mobile UX](DASHBOARD-AND-MOBILE-UX.md) and [Website and copy](WEBSITE-AND-COPY.md) before implementing screens. Both are required product work.

For app text and marketing, also read all four [foundational documents](foundational/README.md). Use [the idea review process](foundational/COPY-AND-IDEAS.md) to record new ideas, conflicts and evidence, and keep the brief current.

Read the capture, repository, provider, runner, security, retention, and billing documents when beginning their work packages. Use [Implementation plan](IMPLEMENTATION-PLAN.md) to choose the next package. Use [Acceptance tests](ACCEPTANCE-TESTS.md) to decide whether it is complete.

Read [Provider setup](PROVIDER-SETUP.md) and [Launch checklist](LAUNCH-CHECKLIST.md) before changing any external account.

## Use the models and contracts

Run `python finance/calculate.py` from the package root to regenerate the planning scenarios. Run `python scripts/validate_package.py` to check document links, JSON, required files, and finance invariants. These commands validate the handoff, not the future application.

Treat `contracts/*.schema.json` as proposed serialized contracts. Generate runtime validators in the application and test that they reject unknown or invalid fields. Use `fixtures/` only in tests or explicitly labeled demo mode.

Keep the editable finance workbook beside `finance/assumptions.json`. Changing a workbook assumption does not update application billing. Change production price configuration through a reviewed migration and preserve existing customers' terms.

## Track external gates without blocking local development

Implement simulated responses for unavailable external accounts only in tests. Keep the real feature disabled and explain its state in the setup dashboard. Do not report a simulated integration as working.

The unresolved gates are provider registration and scopes, production credentials, actual tax evidence, legal publication review, source-access rights, and production security checks. They are listed individually in [Launch checklist](LAUNCH-CHECKLIST.md).
