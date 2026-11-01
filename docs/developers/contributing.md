Keep the documentation tied to real tool discovery and synthetic examples. Public docs compile from an explicit allowlist and do not query a person's library or a model.

## Edit the source

1. Add or edit public Markdown under `docs/developers`.
2. Register its route, title, group and optional diagram in `manifest.json`. Keep existing URLs and tool anchors stable.
3. Update `packages/mcp/tool-guide.ts` when a real tool's primary group, skill tags or workflow changes. Keep schemas, scopes and annotations in the runtime registry.
4. Compare every field and effect claim with its handler and serializer. Label schematic examples and unpublished output schemas explicitly.
5. Update the dated changelog. Separate published behavior from a local candidate and unverified host acceptance.

Use existing requested-post access boundaries. Never add private operational notes, customer content, credentials, signed asset links or retained provider bodies to the public allowlist.

## Regenerate and check

Run these commands from the repository root:

```sh
node scripts/generate-mcp-reference.mjs
node scripts/generate-mcp-reference.mjs --check
node node_modules/vitest/vitest.mjs run tests/mcp-reference.test.ts tests/tool-guide.test.ts --maxWorkers=1
```

The generator discovers the feature-enabled registry using a synthetic `tools/list` request. Its invocation callback rejects tool execution. It also compiles only manifest-allowlisted Markdown into `content.generated.json`. Commit generated descriptors and public content with their sources.

The normal CI Vitest run includes the reference and guide checks. Reference drift, missing tool ownership and invalid skill tags fail these checks. Run the relevant lint, types, public-doc tests and required release checks for the change. Browser acceptance checks search, old deep links, mobile navigation, diagrams and disclosure behavior separately.

## Write safe examples

Start with a read-only request such as "Find my saved insights about retries; do not start analysis or spend credits." Use returned IDs for dependent operations. A synthetic ID illustrates a shape; it is not runnable account data.

Use synthetic serializer fixtures for exact output examples. Until an example is checked against a serializer, label it schematic and avoid presenting it as an exact contract. Include pending, stale and unknown outcomes where they affect recovery. Never test discovery by starting a paid job or publishing a sample issue.

## Review public claims

Keep infrastructure cost separate from model generation, quotes separate from holds, and holds separate from final charges. Record host-specific acceptance in [Host support](/docs/mcp/host-support). Additional suggestions in the owner review remain later work unless separately approved.
