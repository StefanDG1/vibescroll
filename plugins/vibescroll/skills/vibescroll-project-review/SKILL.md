---
name: vibescroll-project-review
description: Review saved VibeScroll insights against an explicitly selected approved project and prepare a current private cited suggestion.
---

# Review project relevance

1. Obtain the named/selected project's current granted context through `get_profile(profileId)`. A selected repository grants no code access or execution authority.
2. Inspect current evaluation metadata and cited source results. Do not invent an evaluation for a source or project that the server did not return.
3. Keep relevant, no-fit, already implemented, unsupported, needs-context and deferred outcomes distinct. Missing evaluation pages are not evidence that the full library was reviewed.
4. If the user asks for a private suggestion, call `draft_project_suggestion` with the exact current evaluation ID, evaluation hash and grant version. Existing edits must survive retry.
5. Open `open_vibescroll` with `view=projects` for the review board. Use the returned protected review destination for editing or approval beyond the current MCP interface.

Explain the supported relevance, limitations and next reviewed action. A private draft starts no new analysis, spending, coding or publication. Never promote hypothetical benefit to a measured outcome.
