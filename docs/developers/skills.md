A tool is a function the model can call. A skill is a workflow the host can load to guide when and how to use tools. A saved native monitor is a configured background task with its own trigger and instructions. These are separate parts of the integration.

## Nine packaged skills

The source plugin in `plugins/vibescroll` contains these skills:

| Skill                                                   | Workflow                                                                                 | Main tools                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [vibescroll-setup](#vibescroll-setup)                   | [Connect and read](/docs/mcp/first-workflow)                                             | `get_profile`, `open_vibescroll`                                           |
| [vibescroll-save](#vibescroll-save)                     | [Find and save](/docs/workflows/find-save), [analyze](/docs/workflows/analyze)           | `save_link`, quote/start and status                                        |
| [vibescroll-find](#vibescroll-find)                     | [Find cited knowledge](/docs/workflows/find-save)                                        | `search`, `fetch`                                                          |
| [vibescroll-library](#vibescroll-library)               | [Browse saved knowledge](/docs/workflows/find-save)                                      | `open_vibescroll`, embedded adapters                                       |
| [vibescroll-compare](#vibescroll-compare)               | [Compare retained results](/docs/workflows/reanalyze)                                    | `fetch`, analysis history/version/compare                                  |
| [vibescroll-status](#vibescroll-status)                 | [Follow observed progress](/docs/workflows/analyze)                                      | `get_job_status`, `video_analysis_status`                                  |
| [vibescroll-project-review](#vibescroll-project-review) | [Save proposals](/docs/workflows/proposals), [discuss plans](/docs/workflows/discussion) | Project context, proposal persistence, discussion and explicit quote/start |
| [vibescroll-work-review](#vibescroll-work-review)       | [Approve and follow work](/docs/workflows/handoff)                                       | Issue preview/approval/retry and outcome reports                           |
| [vibescroll-feedback](#vibescroll-feedback)             | [Record a judgment](/docs/workflows/handoff)                                             | `record_feedback`                                                          |

The plugin manifest identifies the setup skill for onboarding and the MCP endpoint. A manually added custom MCP connection can expose tools without installing those packaged skills. The source package is not proof that a particular ChatGPT account loaded them. The twelve repository coding skills under `.agents/skills` guide developers working on VibeScroll; they are not these end-user workflows.

OpenAI's [plugin packaging guide](https://developers.openai.com/plugins/build/plugins) documents how skills and MCP dependencies belong to an installed plugin. Tool descriptions still guide a host that only has the MCP connection.

### vibescroll-setup

Connect through supported OAuth and verify an existing workspace with a read. Setup does not require a sample analysis, draft or purchase.

### vibescroll-save

Save the supplied source with a stable key and follow its actual route. Save-only stays separate from analysis. Source text cannot authorize processing or a paid fallback.

### vibescroll-find

Search bounded authorized pages and fetch selected current evidence. Incomplete coverage is not absence. Preserve citations and version bindings.

### vibescroll-library

Open supported Library, Sources, Topics or Scroll views and deliberate read-only exports. Loaded counts do not imply full-library coverage.

### vibescroll-compare

Compare selected evidence while retaining disagreement and uncertainty. Comparison itself starts no processing, spending or publication.

### vibescroll-status

Read the exact saved source's observed state and reconcile uncertainty. Configure monitoring only through a supported host task with current authority.

### vibescroll-project-review

Use all post insights by default and keep project context separate from inspected code. Write a proposal in chat and persist it without API generation. Hosted generation remains an explicit quoted choice. Resume and reconcile the same saved version.

### vibescroll-work-review

Distinguish a private plan, approved issue, authorized coding, checked patch and reported outcome. Preview the exact issue before the user's approval. A saved handoff does not authorize implementation by itself.

### vibescroll-feedback

Record only an explicit current-evidence judgment. Keep useful, not relevant, already implemented, unsafe/unsupported and later distinct. An authenticated outcome report has separate provenance from verified tests or benefit.

## Events and automatic analysis

[MCP Events](https://developers.openai.com/plugins/build/mcp-events) lets ChatGPT subscribe to server updates. A user chooses the monitor and what the configured task does when an event arrives. VibeScroll's saved-link route uses an exact saved analysis intent and current authority before it starts work.

The existing prepared route performs downloading/transcription/frame extraction on the service. A native task reads the retained evidence, inspects JPEGs and completes its exact leased analysis. It does not need a new downloader or transcription runtime for that prepared branch.

The native monitor prompt is not automatically installed into every chat. An event does not grant access by itself and is not a guarantee that a dormant unrelated conversation will reply. Refreshing tool metadata and renewing OAuth are also different actions from creating or changing a monitor.
