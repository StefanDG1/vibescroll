# ADR 150: request private Cloud video analysis through MCP

Date: October 25, 2026, Europe/Berlin. Status: implementation candidate; offline and release evidence are recorded separately.

## Problem

The MCP execution tools can claim a previously approved Cloud job, but `request_analysis` only offers local processing, credits, projects or an app review link. The existing execution permission explicitly requires separate approval. Combining it with the old local-request scope cannot silently create new Cloud authority.

## Decision

Extend the existing connection grant with optional `cloudRequestPolicy`, `explicit_per_source_v1`. The recent-authenticated app grant editor offers this unchecked by default only to an eligible private owner. Both request and execution actions are required. Selecting it turns off automatic local analysis in the reviewed save. The server stores the current media policy hash; changed policy requires another connection review. Existing grants gain no implicit permission.

After that one-time setup, `request_analysis(mode=work_cloud)` accepts an exact current source generation/revision, grant version, requested model/effort, own-subscription selection, zero API maximum and finite result retention. The server derives the exact input and policy hashes atomically. This explicit request needs no further per-post browser approval or preview round trip. It does not authorize automatic dispatch of future links.

Use the same source job, reservation, private media-v2 protocol and lease. Both OAuth scopes, configured-client scopes and current app-grant scopes are checked. An intake receipt alone cannot grant execution. Require an owner-private source, source rights, retention, current selected/library scope and the existing founder/media gates. Do not reinterpret an older team workspace or move its saved posts to pass the check.

Limit fresh MCP requests to six per actor per hour across clients. An identical still-unclaimed request returns the same generation without another reservation or quota debit. Recovery may use its original request identity or current status identity. Changed settings, a claimed job or an unknown outcome cannot create a replacement. The original claim/consent/token and fixed-deadline checks remain unchanged. App approval retains recent authentication and its exact input hash.

`get_job_status` supplies the current generation, revision, grant version and compact Cloud state/stage. The queued receipt says waiting for Cloud and does not claim execution. Before claiming, the actual Work Cloud task still needs supported tools, requested settings and restricted Internet controls. No GitHub repository, paid API, local computer or publication authority is added by this request.

## Evidence and release boundary

Focused backend tests cover legacy denial, authority boundaries, exact identity, replay, unknown/claimed outcomes, hourly limits, retention and unchanged text/media execution. Transport tests cover strict bounds, both MCP eras and disabled media gates. Connection tests cover explicit opt-in, stale acknowledgement, scope/gate loss, no-computer setup and unchanged legacy permissions. Root owns combined checks, independent review, native screenshots and exact-head CI.

The two optional grant fields change one existing table validator, with no new table or index. Publication needs a fresh bounded schema-impact proof for that exact candidate; the earlier unchanged-schema receipt is insufficient. Full main's other migrations remain held.

This is a private experimental request route, not commercial subscription eligibility, automatic dispatch, shared-catalog contribution or a successful production video result. Keep the cumulative USD3 cap and reserved owner-test post. One bounded private-profile MCP read returned unavailable authorization and changed no source, grant or job. Prepare the concrete supported connection step before asking the owner to test.
