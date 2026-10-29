# Use prepared analysis through MCP

Mode: technical how-to. Candidate behavior from [ADR 200](../adr/200-server-prepared-analysis-service-and-mcp-credits.md); [current state](CURRENT-STATE.md) records actual production acceptance.

## Credit route

1. Connect the existing VibeScroll MCP once with library read, link save, analysis request/execute and job read. Keep the existing account/grant. Refresh a cached tool list when necessary; new tools do not require deleting OAuth.
2. Call `save_link` with the URL, stable key and `analyze=false`. Keep its `source_id`. This saves the user's association and can reuse shared results.
3. Call `quote_video_analysis` with `{sourceId, executor:"gateway"}`. Set `reanalyze:true` only for an explicitly requested new version. Explain preparation, analysis and maximum credits. A zero-cost ready response needs no new work.
4. After acceptance, call `start_video_analysis` with those fields, returned `quoteHash`, `maximumCredits` and a stable operation `key`. Do not invent another key after an ambiguous response; replay the exact call to retrieve its existing run.
5. Read `video_analysis_status`. Return its post URL and actual stage, reserved/final credits and safe failure code. Do not invent a percentage or ETA.
6. Read completed result/history through existing granted tools. First success selects its result; later versions preserve the incumbent. A shared wait starts no second paid job.

Baseline is Muse Spark 1.3 Contributor at medium reasoning, with API ASR only when needed. Other model bands and commerce migration remain separately planned. Existing credit units are unchanged.

If your host has cached the older tool list, use `request_analysis` with `mode:"credits"` to read the fixed-baseline quote. After acceptance, repeat with its returned generation and maxCredits. Read preparation and settled credits with `get_job_status`. This starts only the first analysis, reuses its deterministic operation on replay and requires no reconnect. Explicit new versions use quote/start.

## Own-subscription route

The supported native VibeScroll Assistant must be connected and monitoring once. Its saved Cloud defaults supply model/effort. For accounts with server preparation enabled, ordinary app/MCP Save queues preparation and then one evidence-ready event. No second checkbox, per-post review, repeated pasted prompt or host ASR install is needed.

Explicit service requests use the same quote/start tools with `executor:"work_cloud"`. Fresh preparation costs one service credit. Retained preparation and subscription reasoning cost zero. No API reasoning fallback is allowed. An inactive native host needs resume/setup guidance, not a new MCP app or different funding.

Events are host-specific. A connected MCP does not create a generic backend API into every consumer subscription. Results are available from their post and configured Assistant. Do not promise unsolicited replies in arbitrary chats.

## Diagnose without rerunning

Inspect status and the exact private receipt when authorized. Separate saved, preparing, waiting for Assistant, analyzing, ready, failed and unknown. Retained evidence needs no new acquisition. Unknown work keeps its hold until reconciled. Preserve failed attempts and leases.

Provider configuration/funding, Pro access, OAuth, VibeScroll grant and native monitor are separate checks. Supported OAuth refresh avoids repeated normal sign-in, but credentials remain revocable. Ordinary permission changes use a normal session; account deletion retains stronger authentication.
