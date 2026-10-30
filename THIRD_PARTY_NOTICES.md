# Third-party material

## Assistant protocol runtime

The exact `@modelcontextprotocol/server` 2.3.1 dependency implements the official MCP protocol. Its complete mixed license notice is preserved in [the runtime notice](licenses/modelcontextprotocol-server-2.3.1.txt): Apache-2.0 for new and consented code, MIT for unrelicensed contributions, and CC-BY-4.0 for documentation excluding specifications. Upstream source is [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk). The dependency's SDK version does not change VibeScroll's product V1 scope. Protocol support alone does not establish a working account connection, persistent Events delivery, or provider approval.

Ten skills are copied from the owner's installed global skills into `.agents/skills`. Their supporting files are included. `skills-manifest.json` records each source location relative to the global skill or plugin directory, snapshot date, notices found, and SHA-256 hashes.

The frontend-design skill includes its original `LICENSE.txt`. Other selected skill directories do not contain a standalone license notice in the copied directory. Missing notices are unresolved provenance items, not evidence of permission to redistribute publicly. Review the upstream package terms before public distribution and remove or replace material whose distribution rights cannot be established.

No application code from Kinetexa, Vydero, or the WorkOS starter is copied into this foundation. Their repositories were read to identify patterns. Any later source reuse needs its own attribution and license record. The WorkOS starter inspected for research contains an MIT license. Kinetexa declares AGPL-3.0-only. The template does not inherit a license merely by studying either repository.

The original research report remains in the owner's Downloads folder. This repository stores an analysis and source fingerprint, not the report's personal career details or unresolved embedded citations.

## Media acquisition runtime

The optional E2B acquisition image installs the official yt-dlp Linux release recorded in `infra/downloader.json`, verified against its published SHA-256. Its bundled executable includes material under its upstream distribution terms; it does not inherit VibeScroller's MIT license. Upstream source and distribution notices are available at [yt-dlp](https://github.com/yt-dlp/yt-dlp). FFmpeg is supplied by the pinned Debian base package and retains its package license. Neither executable nor creator media is redistributed in this source repository.

## SEO audit snapshot

The `seo-audit` skill is copied from coreyhaines31/marketingskills at commit `5b2c0007766c6a1cf1d53fd8fc73e979e0821022`. Its MIT license, copyright notice, and references are retained in `.agents/skills/seo-audit`. The original `companynerve-launch` skill is covered by this repository's MIT license. Earlier copied notices remain unchanged.

## assistant-ui Elements

The analysis step list, error state and expandable saved-plan card adapt the MIT-licensed AgentPlan, ErrorState and ArtifactCard components from assistant-ui/assistant-ui at commit `3fa379f814dadb02b9f9ad04e31c2d2ba92df094`, copyright2026 AgentbaseAI Inc. The complete [MIT notice](licenses/assistant-ui-elements-3fa379f.txt) is retained. Adaptations use VibeScroll styles, explicit observed stage states, indeterminate progress and server-approved recovery actions. No assistant-ui inference/chat runtime is installed.
