Ordinary successful calls return a JSON value in both MCP text `content` and `structuredContent`. These represent the same result, not two jobs. The compact UI may use additional routing metadata. A retained-frame call instead returns metadata text and a native JPEG image attachment.

## What each read returns

| Tool                              | Data returned                                                                                         | Current bound or exclusion                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_profile({})`                 | Authorized workspace/grant metadata and coverage                                                      | 10 profile records examined per page                                                                                                                       |
| `get_profile({profileId})`        | Selected workspace, granted project profiles and current evaluation summaries                         | Up to 5 full project profiles and 5 evaluations per project; no repository files or general chat history                                                   |
| `search`, legacy                  | Matching insight IDs, titles, URLs, excerpts and coverage                                             | Examines 5 permitted posts per page; at most 20 matches; title 200 characters, excerpt 600                                                                 |
| `search(mode="ranked_v1")`        | Compact post records and referring post/insight matches in the active workspace                       | At most 50 indexed candidates and 4 source hydrations per call, 20 matches, 200 candidates per signed continuation session; current-index coverage can lag |
| `fetch`, legacy/structured        | Selected insight or saved analysis text and citation summaries                                        | First 20 insights, claims up to 2,000 characters, up to 10 evidence summaries per insight; no raw transcript/media                                         |
| `fetch(format="post_context_v1")` | Exact retained post/version, metadata, insights, transcript segments, observations and frame manifest | Bounded pages below100,000 UTF-8 bytes; follow context.next_cursor; frames are sampled and contain no image bytes in this manifest                         |
| `read_post_frame`                 | One actual native JPEG plus exact frame/version/evidence metadata                                     | At most150,000 decoded bytes; verifies size/hash/dimensions and current authority before and after storage I/O; no worker acknowledgment                   |
| `get_project_application_context` | Version/hash references, saved summary, post insights, confirmed project profile and prior proposals  | At most 20 selected insights; 120,000 bytes of context data before the context hash and MCP envelope; no repository code or raw media                      |
| `list_project_proposals`          | Titles, IDs, versions and dispositions                                                                | 10 examined proposals per page; project filtering can leave an empty page with a cursor                                                                    |
| `get_proposal_discussion`         | Current plan/context, discussion, latest operations and issue state                                   | 20 non-tool discussion messages per page                                                                                                                   |
| `video_analysis_status`           | Executor, stages, quote/charge/billing, failure, catalog/version/post links                           | Last 20 stages; no private logs or raw provider response                                                                                                   |
| `analysis_version`                | Saved output, model provenance and version/evidence hashes                                            | Assistant reads suppress the raw post, frame list and evidence details                                                                                     |
| `work_cloud_retained_frame`       | One authorized retained JPEG plus integrity metadata                                                  | Maximum 150,000 image bytes; native image content, not a claim that the full video was watched                                                             |

These are source-derived contract/read bounds, not measured total database bytes or a promise that every result fills its maximum.

## Read receipts as states

| Field or state                                  | Meaning                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Source ID / post URL                            | Which saved item an operation concerns                                                                                   |
| Queued, waiting, running                        | Accepted/in progress, not a completed analysis                                                                           |
| Generation / revision / grant version           | Concurrency and current-authority bindings for later requests                                                            |
| Analysis ID / context hash / selection revision | Exact saved analysis and project context used by a proposal or version selection                                         |
| Coverage / examined / next cursor               | What this bounded read covered and how to continue                                                                       |
| Maximum or reserved credits                     | An upper bound or temporary hold, not the final charge                                                                   |
| `chargedCredits: null`                          | No final charged amount is available. Check billingState; null alone means neither zero charge nor an active reservation |
| Catalog published                               | A neutral shared result exists; private notes/project plans do not become public                                         |
| Requested / reported model and effort           | Requested settings versus host-reported provenance; no automatic independent attestation                                 |
| Evidence hash                                   | Identity/integrity binding, not proof a claim is true                                                                    |
| Outcome report                                  | An assistant/user report, distinct from signed GitHub observations or verified test results                              |

## Example: queued is not finished

The following is a schematic explanation, not a byte-for-byte API response. Use the actual returned keys and IDs for subsequent calls.

```json
{
  "sourceId": "synthetic-post",
  "state": "queued",
  "maximumCredits": 3,
  "chargedCredits": null,
  "next": "Read the returned status or wait for the configured completion event"
}
```

## Errors and recovery

Common read/list/status tools advertise output schemas in discovery. The reference expands those schemas alongside exact inputs. Checked [synthetic examples](https://github.com/StefanDG1/vibescroll/blob/codex/launch-20261022-link-cloud-compatible-20261025/docs/developers/examples.json) use placeholder identifiers, never operator data. Older clients can keep the existing full/legacy formats.

MCP transport/authentication errors, strict-input errors and returned business errors are different boundaries. A tool can return `isError: true` even when its HTTP transport succeeded. An `mcp/www_authenticate` challenge indicates an authentication flow; a workspace-choice response does not.

`PROFILE_SELECTION_REQUIRED` supplies a `get_profile` next action. Keep the existing connection and choose the returned workspace. Version conflicts require a fresh read and reconciliation. Insufficient funding or credits requires that route's action; it cannot silently switch to a paid API or another executor.

Returned business failures include an allowlisted `code`, `stage`, `retryability`, opaque `correlation_id` and safe `next_action`. A correlation ID helps identify a response; it does not grant access or establish that a job failed before dispatch. `reconcile_first` means preserve the existing operation and read its status. Only an actual authentication failure carries the OAuth challenge. Provider availability errors must not send users through reconnection.

Some generic failures currently collapse to “Current authorization or evidence is unavailable.” This message alone does not identify an expired login, missing grant or unavailable evidence. The implementation needs more precise safe errors; repeatedly reconnecting is not a verified fix. Preserve queued/running/unknown jobs and their holds until their exact state is known.

## Read ranked context fields

`posts` holds one compact record per returned canonical post/version. Use `fetch_id` and the exact workspace/share references to read it. `matches` refers to those records with `post_id`. `access_paths`, when present, lists access observed on the emitted page rather than every possible share.

`scanned_candidates` counts newly examined candidates in this call. `session_candidates` counts them across signed continuation. Extended requests also report `loaded_candidates`, the compact prefix rows actually loaded, which can exceed newly examined candidates. `loaded_bytes` measures serialized instrumented document reads, not billed database bytes. Read these with `coverage`, `has_more`, `exhausted`, `truncated` and `next_cursor`; an empty partial page is not proof of absence.

Optional `project_fit` reports matched/total topic criteria for the current authorized project profile. A compact criteria list can omit detail with `criteria_omitted` while retaining the full counts. It ranks the emitted page, not the whole library or measured business outcomes. Retrieve exact project-application context when prior proposal/history details are needed.
