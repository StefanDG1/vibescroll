# ADR 199: defer embedded ChatGPT UI and correct prepared version history

Date: 2026-10-29
Status: accepted; deployed at fc2ef422aace635a122073ae59a396a62299d204

## Decision

The owner requests disabling the embedded ChatGPT interface until later work. Production MCP and its public setup descriptor use one explicit disabled constant, independent of an old widget environment setting. The server omits UI entry tools, resources and rendering annotations. Ordinary tools, native Events, OAuth grants and stored results remain available. Setup verifies get_profile and directs users to saved-result website links. Keep the isolated widget implementation and its tests for later work; do not delete the working plugin or ask customers to reconnect.

## Prepared analysis verification

Backend 4fefc65 saved both newly tested analyses using the same retained transcript and eight JPEGs. Muse saved five cited insights in 62.713 seconds from queued to stored, with Gateway-reported inference cost USD0.0017966. The native Assistant automatically consumed an app Save event and saved five cited insights in 189.216 seconds from queued to stored. Browser request to reactive completion measured 63.216 and 190.395 seconds respectively. Fresh preparation had earlier taken 41.093 seconds, including 33.311 seconds Sandbox and 1.973 seconds ASR. These are separate measured phases, not two fresh full-link trials. Existing title/thumbnail preclude a cold-preview claim.

The original selected version remains unchanged. Both new versions retain the same evidence hash and are private candidates. All eight owned JPEG responses matched stored byte hashes and decoded to 540 by 960. The actual native completion reports image inspection, and the monitor remains active. Requested native model/effort are gpt-6.1-sol/high; actual model and effort are not independently attested. Legacy source-runtime cache failure remains unresolved and is distinct from the working retained-evidence branch.

Read-back found a history projection error. Direct reads correctly return both new versions as ready, but history compares prepared evidence to the legacy extraction revision and incorrectly reports removed. Reuse the existing current prepared-evidence authority guard for prepared versions, retaining legacy revision validation and checking result retention. This changes no stored analysis, selection, schema or index.

## Verification

Focused MCP and version tests cover absent production UI registrations, retained ordinary analysis tools, prepared API/native history, and unchanged selected versions. Enabled local widget factory tests remain. Full checks, exact CI and production verification are required before publication is claimed. No new paid analysis is needed to verify this checkpoint.

Managed/prepared shared publication, precise customer credits, mixed-source acceptance and paid commerce remain open. Earlier rejected attempts, financial holds, source permissions and the reserved post remain preserved.

Full offline pnpm check passed on October29 with Windows/Node24.22.1/pnpm12.3.4: 1335 core,47 auth/hook and148 UI/public tests, Node/Python checks and both production builds. Three hosted integration and seven Windows Python cases remain skipped. A subsequent document validation passed352 documents and12 skill snapshots. Exact-head Linux CI and publication remain pending.

## Production acceptance

Exact CI40923237655 passed. Backend publication acknowledged at17:41:59UTC. Actual12-component prediction scanned/backfilled no existing table/index. Fixed Basic build41.749s passed staged exact health/descriptor and same-build promotion. Canonical health returnsfc2ef42 and widgetEnabled=false. Original MCP remains connected with automatic_analysis=true and no setup required. History now returns all three versions Ready, insight counts4/5/5, selected original and revision0. No new analysis ran. Temporary comparison policy/test-key environment were removed and the provider key revoked, preserving results and unrelated keys. See the [production receipt](../operations/evidence/launch-20261029-headless-mcp-production.json).
