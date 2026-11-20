# One workspace search service

Accepted November 11, 2026 for R168. [Production receipt](../operations/evidence/launch-20261111-workspace-hybrid-search.json).

Use a single Convex retrieval service for the Library and MCP. Search text and saved evidence passages with Convex text and vector indexes. Promote explicit references found in source titles and retained evidence. Use verified project context to rank otherwise relevant results. Retrieve each supported part of a compound request separately and return evidence or an explicit coverage status for each part.

Run the pinned multilingual MiniLM embedding model on the first-party VibeScroll website. The model exceeds the observed Convex Node runtime memory envelope. Verify the public weights by SHA-256 and authenticate Convex-to-website requests with a shared service secret. Lexical retrieval continues during an embedding outage. Users can continue a complete review with signed cursors beyond the previous result ceiling.

Prepare the new indexes and populate search projections before changing the serving path. After validating the new website and MCP reads, retire the old modes, indexes and derived search strings. Preserve source identities, saved evidence, version selection and access grants. The backfill uses the first-party encoder and does not create analysis jobs or consume app credits.
