# Contribute to VibeScroll

Start with [AGENTS.md](AGENTS.md), [START-HERE](docs/START-HERE.md), [decisions](docs/decisions.md) and the relevant work package. Preserve CompanyNerve attribution and third-party notices. Hosted and personal deployments use one maintained core.

## Run a synthetic preview

Use the verified Node 24.22.1 patch and pnpm 12.3.4. Install with pnpm install --frozen-lockfile, then follow [local development](docs/local-development.md). The /demo preview needs no provider accounts. Real integrations require dedicated test accounts and reviewed budgets, never inherited production credentials.

## Make a reviewable change

1. Use a focused branch and explain the user-visible problem.
2. Read applicable instructions. For copy, read all four [foundations](docs/foundational/README.md) and their [review process](docs/foundational/COPY-AND-IDEAS.md).
3. Preserve tenancy, deletion, reservations, exact approvals and isolation. A model output cannot expand authority.
4. Format changed files. Run pnpm check, node scripts/audit-dependencies.mjs, git diff --check, a redacted secret scan and relevant integration/browser checks. Keep failures and unavailable checks visible.
5. Record command, environment, UTC time, commit and result in [implementation status](docs/implementation-status.md). Distinguish fixtures, live integrations, physical devices and independent humans.
6. Review the diff and open a focused PR with behavior, validation, migration and rollback where needed.

Before interface changes, read the installed Next documentation required by apps/starter/AGENTS.md. Inspect 320/390/768/1440 widths, both themes, keyboard, zoom and reduced motion. Do not add paid dependencies or run hosted tests without authorization.

## Keep Help current

[docs/help/manifest.json](docs/help/manifest.json) maps guides to components, contracts and assets. For a changed dependency, record updated, unaffected-with-reason or reverified in the PR. Update lastVerifiedCommit and review mode when reverified. Only approved entries appear publicly; screenshots require synthetic data and individual review before entering public assets. Do not mark a source read as a live walkthrough.

## Code map

The Next app and public site live in apps/starter. Convex owns persisted authorization and state. Packages contain providers, policy, runners and knowledge logic. Contracts specify serialized data. Tests cover policy and workflow boundaries. Docs contain product requirements, operations and dated evidence.

## Report safely

Use [private security reporting instructions](SECURITY.md) for vulnerabilities. Public issues need a synthetic reproduction, expected/actual result, version and safe error code. Never include credentials, account exports, source archives or private transcripts. Respect [community conduct](CODE_OF_CONDUCT.md).

Maintainers triage by user impact and boundary risk. An issue label or proposed task does not authorize spending, publication or account access. Maintainer review is required before merge. Main updates follow the [versioning policy](docs/VERSIONING.md) and fixed Basic queued builds.
