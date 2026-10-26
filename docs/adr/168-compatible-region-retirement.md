# ADR 168: retire regional sharing on the compatible serving line

Date: October 26, 2026. Status: implementation candidate, not published.

## Context

The owner explicitly removed region collection, regional aggregation and the globe from the link-to-insights plan. These removals exist in the larger main candidate, whose unrelated populated-index migration remains held. The compatible production UI still offers a new regional opt-in and displays publication controls beside ordinary analysis.

## Decision

Port only the retirement to the compatible serving line. Refuse every non-null regional opt-in at the existing authenticated mutation, even from older clients. Keep its owner/admin checks and bounded actor-indexed withdrawal. Retain historical rows until the owner withdraws them or account deletion removes them. The anonymous compatibility query returns an empty array without reading any region or edition records. Remove the public geographic read helper, discovery section, unused globe components and CSS.

Keep deliberate edition/collection management and withdrawal under a native, initially closed Advanced privacy and publication disclosure on a post. No publication or consent is granted by opening it. Existing authenticated actions and release gates remain authoritative.

No schema, index, table, component, cron, source analysis, library migration or automatic fallback changes. This does not close the automatic Cloud acquisition-network gate or publish the main-only Home/navigation work.

## Validation

The retirement regression fails against the serving implementation because a new opt-in succeeds. Verify refusal of new choices, empty anonymous aggregation, retained old consent before withdrawal, foreign-workspace refusal and withdrawal with publication disabled. Verify Discover makes only its collection query and has no region UI. Existing publication, withdrawal, auth, Cloud, renderer and full build checks remain required. Actual staged and production acceptance will be recorded separately.
