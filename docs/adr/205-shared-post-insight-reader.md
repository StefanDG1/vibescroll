# ADR 205: shared post and insight reader

Date: October 30, 2026. Status: local candidate, not deployed.

The owner prioritizes the rest of the plan over further caption-specific extraction work. Preserve usable captions and the working transcription path, but do not delay the reader, proposal workflow or releases for a dedicated caption canary.

Start reader checkpoint2 with a shared presentation component. The standalone post keeps its current authorized evidence, citations, transcript disclosure, version history, live status and project actions. Display a larger source thumbnail/title beside the insights on desktop and above them on smaller screens. A direct project-action link scrolls to the existing controls without starting evaluation or changing funding.

Use child slots supplied by the route adapter rather than copying the source analysis, querying another store or creating a second assistant backend. The component imports no Next.js router, authentication client or MCP bridge. It can later be reused by the home feed and a host adapter. Existing protected image routes remain the only image authority.

This checkpoint uses a retained preview and an original-source link. Supported inline playback, active-only feed loading, project recommendations and the compact MCP view remain later work. No autoplay, universal platform player, fresh inference or complete reader acceptance is implied by this layout change.

Require root checks, desktop/mobile browser acceptance, exact CI, staged health and same-build promotion before publication. No backend bundle, schema, provider or credit change is needed.
