# Workspace hybrid search release

The Library and MCP use one retrieval service. Convex indexes authorized saved text, retained passages and multilingual MiniLM embeddings. The VibeScroll website runs the pinned model. It downloads public model weights verified by SHA-256. Query and evidence text go to the authenticated first-party service.

## Prepare and activate

1. Review the exact branch, dependency audit, focused retrieval checks and Linux CI. Confirm production targets, current usage, existing holds and approved release room.
2. Prepare the expanded projection and indexes before switching readers. Keep old serving requests working through the preparation release. Verify the Convex index state and Vercel deployment for the exact reviewed commit.
3. Configure `WORKSPACE_SEARCH_EMBEDDING_SECRET` in production Convex and the production Vercel project using the same securely generated 32-byte hex value. Verify an authorized synthetic embedding request and a denied unauthenticated request. Keep the existing cursor secret and grant configuration.
4. Enumerate active workspaces through `workspaceSearch:migrationWorkspaces`. Run `workspaceSearchActions:migrateWorkspace` in bounded batches until `done` for each workspace. Pass the last confirmed revision when resuming a batch. If an update changes the revision, recheck state and continue from the committed cursor. Review projection and embedding coverage before switching readers. `workspaceSearch:resumeVectors` restarts a stopped queue once the embedding service is healthy.
5. Switch Library and MCP to the current search contract, then remove the temporary compatibility code and unused search indexes. Page `workspaceSearch:retireObsoleteFields` to remove obsolete derived strings. Refresh MCP tools and verify an exact reference, a compound request, an authorized semantic match, a continuation and a denied foreign read. Record canonical frontend and backend versions separately.

Search reads preserve current source IDs, selected versions and share permissions. The migration removes obsolete derived search strings. It does not reanalyze posts or start paid model requests. If embedding inference fails, search continues with lexical ranking and reports the missing semantic channel. Restore a compatible deployment if activation fails, and keep the expanded schema until its populated rows can be safely removed.
