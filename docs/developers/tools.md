The registry below is generated from `packages/mcp/server.ts` by a synthetic `tools/list` request. It executes no tool and uses no real account. Expand a tool to inspect its complete description, input schema, OAuth scopes and side-effect hints.

## Availability and versioning

The reference includes feature-gated native execution and compact UI tools. A particular host may expose a subset because of deployment flags, scopes, host support or cached metadata. Events subscription methods are separate from ordinary `tools/call` tools. Repository source alone does not prove the current connected host discovered a new tool.

The server validates inputs with strict schemas. Most outputs currently have no published per-tool `outputSchema`; the [result reference](/docs/mcp/results) explains their actual families and meanings. Input schema validation is not an output-completeness guarantee.

## Tool families and effects

| Family                                          | Purpose                                                         | AI or external effects                                                    |
| ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `get_profile`, `search`, `fetch`                | Discover authorized workspaces and retrieve saved knowledge     | No model generation                                                       |
| Project context and proposal reads              | Read exact insight/project context, plans and discussions       | No model generation                                                       |
| `save_project_proposal`, `add_proposal_message` | Persist text written by the chat                                | Writes data, no model generation                                          |
| Video/plan quote and start                      | Estimate or begin explicitly funded work                        | Quote does not start generation; start can reserve credits and queue work |
| Issue preview/approve/retry                     | Freeze and publish the reviewed issue                           | Approval can write to GitHub; unknown state requires reconciliation       |
| Feedback/outcome reports                        | Store a supplied judgment or report                             | No proof of implementation or business outcome                            |
| Version history/selection/reanalysis            | Read immutable results or deliberately select/request a version | Reanalysis can start funded work; selection preserves history             |
| `work_cloud_*`                                  | Exact leased native job and prepared evidence exchange          | Restricted worker authority; not general library access                   |
| Compact UI tools                                | Open or update the supported embedded view                      | Availability depends on host UI support                                   |

## Generated descriptors

Each tool below has a permanent anchor. `readOnlyHint` describes the requested operation, not all transport overhead: even a library read currently performs authenticated throttling. `idempotentHint` is a client hint; writes still require their exact version/idempotency bindings. OAuth scopes are necessary but current membership, grants and funding checks remain authoritative.
