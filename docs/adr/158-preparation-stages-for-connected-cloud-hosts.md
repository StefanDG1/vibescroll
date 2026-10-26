# ADR 158: return media stages through the existing Cloud preparation tool

Date: October26, 2026. Status: implementation candidate.

## Problem

After compatible release bba2715, both the local and operational Cloud task still exposed their original six video tools. New metadata, frame and repair tool names were absent. Publishing an MCP tool does not establish that an existing host refreshes its catalog. The owner deferred reconnection troubleshooting and prioritized a working Reel or TikTok link-to-analysis flow.

## Decision

Support native metadata and JPEG return through the existing `work_cloud_prepare` scalar. A strict `work-cloud-media-stage-v1` envelope names either `metadata` or `frame`. Observation preparation retains its existing contract. Dedicated tools remain available to hosts that discover them.

Lease fields occur only in the outer existing tool arguments. A payload cannot change source, generation, task, token, scopes or funding. Metadata dispatches to the same existing mutation; JPEGs use the same authenticated image action and exact prepared hash/dimension checks. The original120000-byte scalar limit remains. Staged JPEGs have an additional decoded81920-byte cap. Do not recompress an already accepted frame; choose bounded pixels before preparation or use an available dedicated frame tool.

The current approved input describes these stages so a host can discover them without a new tool name. This adds no table, index, schema, permission, worker, automatic paid fallback or provider capability. Repair still requires its separate approval and repair lease. Nothing here proves idle wake, actual source acquisition, transcript accuracy or result completion.

## Verification

Exercise the unchanged preparation tool through both MCP and the authenticated HTTP adapter, including a real81920-byte scalar, strict envelopes, source/lease injection and over-limit JPEGs. Preserve the current media lease/stale-grant/hash/mandatory-image regressions. Exact checks and production receipts remain separate in implementation status.
