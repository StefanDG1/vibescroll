# Domain MCP contracts and workflow reference

Date: November 1, 2026. Status: accepted architecture for R137 implementation; each production checkpoint requires its own receipt.

## Problem and usage

The current tools, schemas, grants, prepared service, wallet and proposal loop already have domain owners. Users need a smaller normal workflow, not a second platform of tool definitions. Documentation groups must remain aligned with actual runtime discovery while preserving existing clients.

```ts
get_profile({ profileId, detail: "summary" });
fetch({ id, profileId, format: "structured_v1" });
// Persist text composed by the host without another model call.
save_project_proposal(exactSavedContextAndVersion);
```

Defaults retain full selected profiles and legacy fetch text. Domain modules own output schemas, evidence and money. A small static guide owns groups, workflow links, skills and explanatory funding labels. Real `tools/list` remains the descriptor/schema authority; exhaustive tests join the two.

## Synthesis decision

Two independent sketches and a read-only cross-judge compared a catalog-centered and a domain-centered shape. The judge scored22/25and23/25respectively. Use the domain-centered base. Both candidates converged on keeping runtime registration/domain authority separate from editorial metadata.

Graft the first candidate's explicit safe-error stage/retryability/correlation/next-action fields, authorization-preserving small proposal projection and provider dispatch barrier. Keep the second candidate's opt-in representations, precise byte boundaries and known/unused/unknown monetary outcomes. Reject a universal success envelope, a new all-purpose tool registry and any unmeasured reduction in authenticated calls. Source sketches and judgment are retained in ignored local architecture outputs; this decision records the durable result.

## Ownership and contracts

- `packages/mcp/tool-guide.ts`: browser-safe editorial information only. It cannot grant access or choose a provider.
- Domain files in `packages/contracts`: actual input/output/error pieces. Version a representation only when required; preserve old defaults.
- `packages/mcp/measurement.ts`: optional observers with no bodies, arguments, user IDs or tokens. Backend response bytes, tool-result bytes, image bytes and nested durations remain distinct.
- Existing Convex readers: current membership, grants, version/evidence and project checks. Summary projection must preserve denial/freshness behavior, even where the database still reads a whole stored document.
- Existing paid-processing/preparation/proposal domains: atomic operation-bound provider reservation, dispatch and settlement, separate from user-credit settlement. Carry every legacy/unknown liability. No purchases or automatic top-ups.
- Existing proposal work and signed GitHub handler: attributed reports and verified provider observations. No public callback secret or parallel completion API.

## Trade-offs and verification

An editorial map duplicates names deliberately; exact discovery-set coverage makes drift fail CI. Small opt-in reads reduce serialization/evaluation work but do not imply smaller stored-document bandwidth. Text fallback remains until actual host compatibility is proved. Search must expose truncation rather than imply completeness when its result cap omits matches.

Verify exact schema/guide/example parity, default-client compatibility, no payload logging, current-authority parity, scoped cursors, concurrent reserve/dispatch/replay/settle, unknown holds and signed/out-of-order work feedback. New empty schema tables may be introduced only through actual compatible no-scan/no-populated-backfill admission. Additional suggestions remain in their separate later backlog.
