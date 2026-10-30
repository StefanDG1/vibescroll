# Signed GitHub issue observations for frozen proposals

Date: October 30, 2026. Status: deployed at8e97e18; real provider lifecycle acceptance remains open. Continues ADR209 and owner requirements R062/R063/R099.

## Decision

Use the existing signature-verified GitHub App webhook to observe an issue containing the frozen proposal package. Do not create a second publisher, polling worker, webhook secret, connection or issue table. The existing issue publisher and PR handlers remain intact.

The locator in the body is untrusted. First validate the HMAC and bounded payload, then load one exact proposal by its normalized ID. Bind its organization, retained source, enabled repository, installation/provider IDs, repository name and exact issue URL. The first observation requires the frozen title and complete body hash to match. A copied marker or an edited package cannot initially claim the handoff. Once bound, another issue ID/number cannot replace it.

Store one bounded latest issue observation within the existing typed handoff JSON. Preserve the frozen package, reports, proposal version/review and all execution/funding authority. Signed provider provenance records open/closed state and the observation time, never verified implementation, CI, merge or user benefit. Later GitHub edits can make bodyMatchesFrozen false while the frozen package stays unchanged.

Ignore exact replay and older provider timestamps. GitHub timestamps have second precision. Conflicting states with the same timestamp produce unknown; delayed delivery cannot choose an order. A strictly newer observation can resolve that ambiguity. Invalid IDs, foreign repositories, deleted/expired sources and the restore lock cause no proposal update. Do not search tables or infer links from arbitrary GitHub text.

## Scope and compatibility

This is issue status only. PR correlation, CI, merge, benefit and actual publication remain separate work. No public tool or OAuth scope is added. Existing get_project_proposal returns its handoff observation when current access permits; the planning-context checks remain unchanged. The ordinary website's existing proposal metadata does not yet display the new observation. The additive backend JSON needs no schema/index/component migration or website build; exact CI and actual compatible-release guards still apply before publication.

A GitHub App needs the Issues repository permission and an issues-event subscription. Existing publisher permissions do not prove that a real provider delivery reached this deployment. Local HMAC/transport tests are distinct from a real issue lifecycle canary. No issue will be published merely to turn this candidate into a success claim.

## Validation

Focused proposal/transport tests cover exact binding, replay, foreign IDs/URLs, malformed locators, state ordering, concurrent edits/reports, deleted-source disclosure, signature denial and restore lock. Record final counts and production evidence in CURRENT-STATE and a dated receipt. Do not forge a live GitHub delivery with an operator secret as provider acceptance.

[GitHub issues webhook contract](https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues) documents GitHub App availability, issue action payloads and at least read-level Issues permission.

Production publication: exact CI41105141135, two deterministic offline preparations,22 guards and actual compatible finish acknowledgement passed. Full local check passed1591 Vitest cases/3skips; Linux CI passed1589/5skips plus types, lint, Node/Python checks, builds and dependency audit. Existing MCP profile and the unchanged version2 proposal passed reads. No real issue, new scope, website build or analysis was created. [Receipt](../operations/evidence/launch-20261030-proposal-issue-events-production.json).
