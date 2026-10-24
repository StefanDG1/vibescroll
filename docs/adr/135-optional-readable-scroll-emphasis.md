# ADR 135: readable public explanations and scoped Help reads

Status: implementation candidate; native browser and production acceptance pending. Date: October 24, 2026.

## Decision

Complete the retained M1 reveal and scroll-emphasis requirement within the existing three-card Source post, Cited insight and Private product review explanation. Keep the original server-rendered content, artwork and source labels. Reuse the current interface-motion preference; add no framework, asset, query or processing call.

Start static. Explicit Play/Pause/Replay controls enable decoration only on a visible desktop page with a fine pointer, permitted interface motion and IntersectionObserver support. Mobile, reduced-motion, stored-off, unsupported and server-rendered views remain readable and static. Controls retain forty-four-pixel minimum height.

On its first visible entry per replay, a card can move six pixels over 240 milliseconds. Text stays fully opaque with its original colors. Visible-card outlines and heading underlines provide emphasis without dimming another card. All genuinely visible cards may be emphasized together; do not invent a single processing stage or scroll-based job progress.

Focus and keyboard interaction pause effects. Pause, hidden/offscreen state, disabled motion and unmount remove decoration immediately. Disconnect observers and ignore late callbacks. Re-entry does not repeat the reveal until an explicit replay. There are no timers, polling, automatic rotation, scroll interception or host tasks.

## Scope Help filesystem reads

The current production build warned that a conditional directory argument in `readHelpArticle` caused whole-project tracing. Preserve the existing approved-manifest and filename checks, but split the root/app working-directory cases into separate reads with literal Help directory prefixes. This lets the build trace only the intended documents. Do not suppress the warning, loosen path checks, add a loader or duplicate the content store.

One fixed offline starter production build passed with zero warnings. The Help detail trace fell from 440 to 164 files, Help index from 437 to 161 and sitemap from 416 to 140. Across eighty-one traces, non-dependency/non-build source references fell from 287 to eleven, alongside thirteen intended Help Markdown files. The audit found no outputs, environment files, Git internals or paths outside the checkout. Seven focused Help cases include actual root/app directory reads and malformed-manifest rejection. No dependency or Next configuration changed.

## Evidence and limits

Fifteen focused UI cases cover server rendering, static defaults, device/motion eligibility, explicit controls, focus/keyboard order, one-time/replay behavior, visibility, cleanup and absence of fetching/timers. Scoped starter types, zero-warning lint, formatting and diff checks passed. An initial fixture used a children prop and was corrected to the ordinary React child argument before the clean lint rerun.

Root reviewed the component, page wiring, styles and tests. Native-browser aesthetics, both-theme contrast/zoom/width observations and production acceptance remain pending; fixture coverage does not replace them. Existing desktop example cycling and scene tabs remain separate controls of their existing content.

The integrated offline check passed 1,625 tests with three hosted skips, all types and both builds. [The receipt](../operations/evidence/launch-20261024-readable-public-site.json) retains the initial product-test timeout, unchanged focused reproduction and unchanged full-source retry. It also binds the build trace and source hashes. No timeout or assertion was relaxed. Parent allowance PR148 passed exact-head CI40068095705; this slice still requires its own exact-head CI.

Keep all provider, privacy, offer and release gates. This slice changes no price, entitlement or processing capability and requires no hosted request or purchase. The cumulative US$3 cap and all earlier unknown holds remain unchanged.
