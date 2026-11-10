# X posts as analysis inputs

Mode: research and proposed scope. November 10, 2026, Europe/Berlin. Owner request R159. Investigated at `e1f7b19` in the compatible checkout. The initial investigation below used offline probes. The owner's follow-up expanded it to [non-paid-API tools and live public endpoint checks](X-POST-NON-API-OPTIONS-2026-11-10.md). No application implementation, deployment or paid request occurred. The existing MCP UI deferral and issue197 approval boundary remain in force.

## Finding

Technically feasible for a selected public post's text and directly attached images, videos and GIFs. Use a dedicated X acquisition adapter and the existing caption/media evidence system. Adding X to the downloader allowlist alone would lose content and still fail current worker validation.

The official API is one acquisition option. The [expanded investigation](X-POST-NON-API-OPTIONS-2026-11-10.md) subsequently verified keyless FxTwitter text/media metadata, actual image access and a direct video HEAD, plus a direct syndication comparison. A complete VibeScroll analysis remains untested. The recommendation is now to compare those non-paid-API routes before committing to an official-API integration. Provider use-case permission and retention/sharing still need review.

## What X exposes

Single-post lookup is `GET https://api.x.com/2/tweets/{id}`. X documents developer account, application and token prerequisites. A lookup can include associated objects. [Post lookup](https://docs.x.com/x-api/posts/lookup/introduction).

Request post `text`, `note_tweet`, `attachments`, `author_id`, `created_at`, `entities`, `referenced_tweets` and `edit_history_tweet_ids`. Prefer `note_tweet.text` when present. Expand `attachments.media_keys`; request media `type`, `url`, `preview_image_url`, `variants`, `alt_text`, `width`, `height` and `duration_ms`. Images have URLs; playable variants provide video/GIF inputs. Preview images are covers, not substitutes for the attachment. [Data dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary).

Map returned media by key, then restore the order in the post's attachment list. Missing keys must produce partial coverage. Treat quoted posts and replies as separate source identities; a linked website is not a direct attachment. Full thread and X Article ingestion are outside this proposed first scope. Expansions retrieve related objects but do not prove that an entire conversation was fetched. [Expansions](https://docs.x.com/x-api/fundamentals/expansions).

X currently publishes USD0.005 per Post read and USD0.010 per User read, using prepaid pay-per-use credits. These are individual resource prices, not an all-in post-import quote. Confirm expansion charges and actual account rates before quoting; add media preparation and model usage separately. No credits were purchased or consumed. [Pricing](https://docs.x.com/x-api/getting-started/pricing).

## Current VibeScroll constraints

| Boundary               | Observed implementation                                                                                                                                                                                                                                   | Consequence                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Input routing          | `packages/media/acquisition-policy.mjs` excludes X. `packages/sources/classify.ts` otherwise recognizes GitHub and Reddit.                                                                                                                                | X URLs do not reach a supported acquisition path.                                                                                          |
| Source transport       | `packages/providers/source-transport.ts` only dispatches GitHub/Reddit.                                                                                                                                                                                   | Add a bounded X transport with credentials kept server-side.                                                                               |
| Worker identity        | `packages/media/cloud_extraction.py` admits Instagram/TikTok and rejects collections. The tool manifest names those platforms only.                                                                                                                       | Returned X post identity and child media IDs need explicit validation.                                                                     |
| Evidence contracts     | `packages/social/contracts.ts` already represents captions, ordered images/videos, hashes and cumulative bounds. Its social platforms are Instagram/TikTok; its Cloud observation branch requires exactly one asset and caps captions at6,000 characters. | Reuse these concepts with a versioned extension for X, zero-media posts and multiple assets. Preserve long text without silent truncation. |
| Citations              | Existing analysis paths support `caption` / `post_caption` plus frame/transcript evidence.                                                                                                                                                                | Preserve author text as caption evidence. Do not disguise it as spoken transcript or unverified supplied text.                             |
| Supplied-text fallback | `packages/sources/urls.ts` only allows GitHub/Reddit as a supplied original URL.                                                                                                                                                                          | Even a manual X fallback needs deliberate URL/provenance support.                                                                          |

The older generic downloader is pinned at2026.08.19. The active prepared Cloud path uses the separate2026.10.21 Python wheel. This investigation checked the latter rather than assuming the older tool's behavior applies.

## What the pinned downloader actually does

The local cached wheel reports `2026.10.21`, release commit `8cdf4fea48ecf4064387375301d7f294ebdb17c1`. Its X extractor excludes `photo` entries, combines video entries from the selected post and its quote, can return a playlist, and can redirect extraction to an external link. Its GraphQL conversion does not preserve the long-form `note_tweet` text. Syndication explicitly warns that metadata/media may be incomplete. [Exact upstream extractor](https://raw.githubusercontent.com/yt-dlp/yt-dlp/8cdf4fea48ecf4064387375301d7f294ebdb17c1/yt_dlp/extractor/twitter.py).

An offline synthetic probe ran the pinned extractor's real parsing methods with provider responses injected and socket connections forbidden. All ten assertions passed:

| Injected case                                  | Observed result                                                |
| ---------------------------------------------- | -------------------------------------------------------------- |
| Text only                                      | No-video error                                                 |
| Photos only                                    | No-video error                                                 |
| One video                                      | Video and description returned; description newlines flattened |
| Animated GIF                                   | Playable variant returned                                      |
| Photo plus video                               | Photo omitted                                                  |
| Two videos                                     | Playlist returned                                              |
| External URL without media                     | URL delegation returned                                        |
| Long-form GraphQL text                         | Legacy truncated text retained instead of note text            |
| Quoted post's video                            | Quoted video returned as part of parent extraction             |
| X URL sent to current Cloud identity validator | `unsupported_source`                                           |

[Recorded probe receipt](../operations/evidence/x-input-pinned-extractor-probe-20261110.json). The command ran `python -B -` against the existing cached wheel on November10. These are parsing/validation observations, not evidence that a public X post can currently be fetched from Vercel. No media download, ASR or model call occurred.

## Original official-API implementation candidate

The expanded research recommends comparing non-paid-API adapters first. The evidence/identity/media work below applies whichever acquisition provider is selected; the official-API transport is an option rather than a requirement.

1. Normalize `x.com` and `twitter.com` post URLs to a post-ID identity. Strip tracking; preserve `/photo/N` or `/video/N` only as a display selection, while importing every direct attachment. Reject profiles, feeds, arbitrary redirects and unsupported short links. Keep author handles as metadata because handles can change.
2. Fetch the selected post through an authenticated, byte/time/rate bounded official API adapter. Preserve full text, author/date, edit identity and attachment keys. Store exact acquisition provenance. Return meaningful unavailable, authorization, quota and rate-limit states.
3. Produce one versioned post manifest containing text plus ordered child assets. Reuse caption citations and existing image/video evidence contracts. Add zero-asset support for text-only posts without relaxing existing video invariants globally. Keep parent post IDs, child media keys, revision hashes and evidence IDs distinct.
4. Retrieve each asset through an allowlisted, DNS-bound media path. Decode images for actual vision observations and visible text; retain actual evidence bytes. Run video preparation for each clip with native-caption/ASR handling and sampled frames. GIFs and silent clips must work without inventing audio. Enforce cumulative limits and the narrower active worker bounds before spending.
5. Analyze the text and inspected attachments together. Cite caption text, individual images or timed video evidence. Preserve partial coverage and per-asset failures; never label a thumbnail or the first successful asset as the complete post. Reanalysis must reuse retained evidence under the approved retention rules.
6. Integrate the supported backend flow with existing Save/status/detail and ordinary MCP tools. Do not reopen deferred MCP UI work. Gate provider access before admitting a paid job; do not automatically substitute another acquisition or model provider.

This is proposed implementation scope, not an approved implementation or release batch. It introduces no new scraper service, replacing neither the existing preparation infrastructure nor its financial controls.

## Material product restrictions

X's agreement describes analysis as subject to X's explicit approval, restricts training/fine-tuning, and contains an iframe prohibition that needs resolution before X content could appear in the MCP widget. API availability alone does not establish approval for external model processing or the hosted product. [Developer agreement](https://docs.x.com/developer-terms/agreement).

X requires stored content to follow source changes/removal and restricts automated redistribution. Inference for VibeScroll: do not inherit automatic shared-catalog publication or unconditional permanent retention for X content. Confirm permitted model processing, per-user storage, source refresh/removal and MCP delivery before enabling those routes. [Developer policy](https://docs.x.com/developer-terms/policy).

These findings do not establish that inference is banned. They identify unresolved provider/product compatibility. A successful fetch would not resolve those questions.

## Acceptance still needed

Before claiming support, verify actual text-only, long-text, multi-image, video, GIF, silent and mixed-media posts through the selected acquisition route. Compare text and attachment counts/order against the original. Test missing media, private/deleted posts, rate limits, quote separation, edit identity, cross-user isolation, removal and credit settlement. Run a permitted bounded live canary only after actual access, use-case permission and funding are established. The previous fresh-video test allowance is consumed and is not reused here.

Recommendation after the owner's follow-up: compare FxTwitter/FxEmbed with direct syndication for a public single-post adapter, preserving the existing evidence pipeline. See [the live findings and other tool options](X-POST-NON-API-OPTIONS-2026-11-10.md). An official paid developer API is not technically required for the observed retrieval cases. VibeScroll's complete import/analysis flow is still unimplemented.
