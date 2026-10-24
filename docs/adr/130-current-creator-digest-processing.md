# ADR 130: show current processing in the creator digest

Status: accepted for local implementation; production acceptance pending. Date: October 24, 2026.

Keep a delivery's existing lifecycle separate from its linked source's current processing status. Extend the existing bounded digest response with optional `sourceStatus`, `discoveredAt` and `deliveredAt`. Read current source state and allowlisted evidence coverage after checking the current actor, subscription, workspace, watch/post identity, retained rights and source authority. Do not return source text, analysis, executor details or contributor identity.

Processing approval legitimately advances the source generation. A historical delivery generation must not hide that source's current status. Changed creator/post revisions, missing/deleted/foreign sources, expired retention or lost rights still fence access. Unknown coverage is null rather than a fabricated full-video claim.

`discoveredAt` is the post's first persisted app observation. `deliveredAt` is insertion into this private digest, not an email, push or host receipt. Keep the existing user's-timezone grouping. The UI labels delivery, source status, evidence coverage, publication, discovery and addition times separately. Older backend responses remain readable with unknown/not-recorded fields.

This projection adds no queue, store, polling, discovery run, analysis dispatch or provider access. A ready source is not independent truth verification; an empty/incomplete digest cannot prove no posts exist. Preserve the full creator-monitoring requirement and its acquisition, daily-completeness, provider and production gates.
