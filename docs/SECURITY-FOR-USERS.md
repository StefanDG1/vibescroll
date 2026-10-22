# Security and privacy for users

Mode: reference. Reviewed October 22, 2026 against application commit `fc2cb3e18d38c980ec63c405491523acb1fda291`. This page describes implemented boundaries and their limits. [Technical requirements](SECURITY.md) and [dated verification evidence](implementation-status.md) remain separate.

## Media download allowlist

An allowlist names the destinations a worker may contact. VibeScroll limits media downloads to supported platforms and their content delivery networks, or CDNs. A video page and its video file often use different domains.

The current accepted source hosts are `youtube.com`, `www.youtube.com`, `youtu.be`, `instagram.com`, `www.instagram.com`, `tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vimeo.com` and `www.vimeo.com`. HTTPS is required. URLs with embedded credentials or custom ports are rejected. Tracking parameters are removed; `v` and `t` are retained.

The downloader accepts individual YouTube watch, Shorts, embed and short links; Instagram post and reel links; numeric Vimeo video links; and TikTok video and `vm.tiktok.com` short links. Platform home pages, playlists, arbitrary paths and direct CDN URLs do not qualify as source jobs. Other short-link domains are not implicitly supported.

Each source selects only its own platform's download destinations:

| Platform  | Allowed media download destinations                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| YouTube   | `youtube.com`, `*.youtube.com`, `youtu.be`, `*.googlevideo.com`, `*.ytimg.com`                                                                      |
| Instagram | `instagram.com`, `*.instagram.com`, `*.cdninstagram.com`, `*.fbcdn.net`                                                                             |
| Vimeo     | `vimeo.com`, `*.vimeo.com`, `*.vimeocdn.com`                                                                                                        |
| TikTok    | `tiktok.com`, `*.tiktok.com`, `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `*.tiktokcdn-eu.com`, `*.byteoversea.com`, `*.ibytedtos.com`, `*.muscdn.com` |

`*.example.com` permits subdomains, not `example.com` itself. Exact base domains appear separately where allowed. This table covers media acquisition. It is not a list of every service used by the website, authentication, storage or model providers.

The source of truth is the [source URL policy](../packages/policy/index.ts) and [acquisition policy](../packages/media/acquisition.ts). Changes to platform delivery domains require a reviewed policy update; an instruction in a video or model response cannot expand the list.

## Private network and redirect protection

The [download broker](../packages/media/public_proxy.py) accepts approved HTTPS host names on port 443. It rejects raw IP destinations and DNS responses containing a non-public address, including loopback, private networks and cloud metadata addresses. The broker connects to the validated IP without resolving the name again.

Each new destination connection receives the same checks, including connections following redirects. Request, transfer, concurrency and time limits also apply. These checks reduce the risk that a submitted link reaches services on your computer or an internal network.

An allowlisted domain does not prove its content is trustworthy, available or permitted to reuse. Broad CDN subdomains remain a trust boundary. The allowlist works alongside isolation, access checks and processing limits.

## Local analysis and data flow

The automatic assistant route uses your paired computer and your own eligible ChatGPT connection:

1. VibeScroll saves the submitted link and queues extraction and organization under your reviewed assistant preferences.
2. The local runner retrieves and decodes media inside pinned Docker workers in Docker Desktop's Linux VM. Workers have a read-only system, restricted resources, no direct network access, no host folder mounts and no Docker daemon socket. A separate broker supplies the permitted download connection.
3. Offline Whisper transcribes prepared audio locally. The official Codex client sends the transcript and sampled frames to OpenAI for inference.
4. Validated derived insights and evidence return to the private VibeScroll library. Local preparation schedules cleanup of its task files after 24 hours. This is a cleanup target, not a promise of deletion while the computer is off or cleanup is interrupted.

Media acquisition is bounded to 250 MB and ten minutes. Missing required isolation blocks processing. Local processing still uses OpenAI and VibeScroll services; it does not keep every result or model input on your computer.

The saved official-client login stays local and is protected for the Windows user with DPAPI between worker sessions. It is restored into a finite isolated worker, not uploaded to VibeScroll. That worker's provider broker separately permits `auth.openai.com`, `chatgpt.com` and `api.openai.com`. This credential boundary describes the local subscription route, not every optional provider integration.

The [local assistant runner guide](operations/assistant-local-runner.md) covers setup, startup, stopping and recovery. The hosted Vercel execution route has a [separate isolation runbook](operations/vercel-sandbox.md); local analysis acceptance does not establish every cloud or coding route.

## Assistant access and spending

OAuth connection and a VibeScroll access grant are separate. Connections records the permitted library scope, actions, selected project context and expiry. Grants can last seven days, thirty days or until you turn access off. Current server checks enforce workspace membership and grant authority outside the model. Revocation prevents subsequent authorized access; it cannot erase content already returned to an assistant host.

After one reviewed setup, explicitly submitted links can queue automatic local extraction without another rights or analysis question. Existing grants need review before gaining that authority. Host-controlled consent and tool approvals remain separate. Source content, repository instructions and model output cannot approve spending or broaden access.

An offline computer leaves work waiting. The optional VibeScroll credit route requires an explicit choice with an available/total balance and maximum cost. Receipts distinguish reservations, actual settled usage and remaining credits. ChatGPT allowance is separate from VibeScroll credits. The runner does not silently switch accounts, models or funding after a failure.

Ordinary extraction and organization do not start project evaluation. A named project or an explicit best-match request adds evaluation within the approved project context. Coding and draft PR publication retain separate approvals. Merge and deployment remain under your control.

## Retrieval failures and privacy limits

A permitted public link can still fail because its platform requires sign-in, rate-limits access, removes a post, changes its CDN domains or returns unsupported or oversized media. A blocked destination is a retrieval failure, not a request for another analysis approval. The saved link remains available; the app offers retry or permitted media upload where supported. Platform restrictions are not bypassed.

The app provides library export, deletion and connection revocation. Hosted retention, deletion exceptions and provider processing are described in the [privacy policy](../legal/PRIVACY.md). These controls do not promise immediate erasure of backups, downloaded exports or copies held by another service.

The [October 22 application release](https://github.com/StefanDG1/vibescroll/releases/tag/v0.1.0-alpha.20261022101814.gfc2cb3e18d38) records one owner-account TikTok submission through ChatGPT, completed local processing and a settled zero-VibeScroll-credit receipt. The implementation ledger separates this result from synthetic tests, pending independent acceptance and other release gates. No independent security audit, universal platform support or accuracy percentage is established.

Private vulnerability reports follow the [security policy](../SECURITY.md).
