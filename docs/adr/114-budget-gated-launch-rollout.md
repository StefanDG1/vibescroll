# Hold production publication while integrating the launch

Mode: reference. Decision date: October 22, 2026.

## Context

The owner authorized merging launch PRs 120–124 and requested production operation. The existing US$2 shared additional Convex cap and prohibition on other new spending remain. The current production backend lacks the new setup/source/public functions. Vercel builds the web application without deploying Convex, so a web-only publication would be incompatible.

The complete candidate passes local checks, including the actual installed Convex app/schema/component bundler and native companion imports. A separately approved metadata-only schema-impact inspection reached its 20-second deadline without a prediction. No backend push or application/inference job ran. Its private credential request was deleted before the network call. Without complete impact metadata, the conditional US$1.50 rollout reservation cannot authorize deployment.

Official [Vercel build documentation](https://vercel.com/docs/builds/managing-builds) also confirms that Pro Basic machines cost US$0.007 per build minute. Fixed Basic and normal queued concurrency reduce costs; they do not establish a free build. A metered staged web build is unnecessary while its backend is held.

## Decision

Integrate the tested stack into main while keeping publication gated. Temporarily set `git.deploymentEnabled.main=false` in the starter Vercel configuration, in addition to the approved launch-branch suppression. Full GitHub CI, production web builds in CI, offline backend bundling, dependency checks and immutable versioning remain enabled. This is a temporary budget/compatibility exception to [ADR 033](033-basic-builds-and-documentation-skips.md), not permission to skip validation of application changes.

Vercel's automatic production-domain assignment is also held. The existing canonical deployment continues serving. Keep fixed Basic machinery and elastic concurrency disabled. Do not pause unrelated projects, change team spending thresholds, open provider/privacy gates, or activate signing, charges or outreach to satisfy release acceptance.

## Resume publication

Follow [the rollout procedure](../operations/launch-20261022-rollout.md). Confirm the exact candidate, supported authentication, complete schema/component impact, no unresolved legacy matching work and a conservative operation reservation within the remaining shared Convex allowance. Missing or partial predictions and an ambiguous deadline keep deployment held; never repeat an uncertain push blindly.

Deploy and verify the compatible backend before publishing the web application. Separately verify that Vercel build usage fits already-included resources with no additional charge, or obtain explicit authority for the new spend. Remove the temporary main Git deployment suppression only when those prerequisites pass. Retain the production-domain promotion hold until exact-head CI, backend canaries and the staged frontend are verified; then promote that exact build and restore the intended automatic publication policy. Record the actual serving version and outcomes.

Neither merging main, producing an alpha prerelease nor compiling code closes provider permission, signed distribution, independent-user, public-content rights, human usefulness or payment/legal acceptance.
