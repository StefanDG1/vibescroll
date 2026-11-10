# X inputs without the paid developer API

Historical research checkpoint. Subsequent production implementation and saved-result acceptance are recorded in [X operations](../operations/X-POST-SUPPORT.md) and [ADR236](../adr/236-complete-x-post-evidence.md).

Mode: research and recommendation. November 10, 2026, Europe/Berlin. R159 follow-up. This expands the [first feasibility investigation](X-POST-INPUT-FEASIBILITY-2026-11-10.md), which focused too narrowly on the official API. The owner explicitly requested examination of existing tools and other repositories. No acquisition provider has been adopted or deployed.

## Conclusion

Yes. Avoiding the paid developer API is practical for public single-post retrieval. We verified a public FxTwitter service returning post text and direct media metadata without our supplying an API key or X session. X's own public syndication endpoint also returned mixed image/video data, though it truncated a long post. These are working retrieval building blocks; VibeScroll's complete analysis integration remains unimplemented.

For the fastest complete-text prototype, use FxTwitter/FxEmbed as the acquisition candidate and reuse existing preparation/evidence code. For a route without a third-party metadata service, investigate a direct syndication parser for ordinary posts, with explicit unsupported/partial handling for long text. Gallery-dl is the strongest additional self-operated downloader candidate. The broader production recommendation depends on which dependency and account-management tradeoff the owner selects.

## Current tools

- The project already has pinned yt-dlp, FFmpeg, image/frame preparation and caption/media citations. Its cached yt-dlp2026.10.21 has a syndication retrieval method, but its final X extractor output discards photos. Reading the raw response through a separate reviewed adapter could preserve them. The current source policy and active worker still reject X.
- Browser-harness is installed and connected. It was used only for public read-only probes in owned tabs. It is useful for verification, but a desktop browser is not a hosted production worker.
- Gallery-dl, Twikit and twscrape were absent from the default Python environment and no matching research installation was found in the searched project output directories. None was installed for this review. The VibeScroll connector's current analysis contract covers Reel/TikTok preparation, not a generic X import.

## Candidate comparison

| Candidate                               | Input coverage                                                                                       | Account/dependency                                                                                             | Assessment                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FxTwitter / FxEmbed                     | Structured text and ordered media, including images, GIFs and video variants                         | Hosted public service works without our X session/key; self-hosting has different credential/operation needs   | Best candidate for the first complete-text prototype. Live bounded evidence below.                                 |
| Direct syndication / Vercel react-tweet | Ordinary post text, `mediaDetails`, photo and video/GIF variants                                     | Public X embed endpoint; no developer subscription or third-party metadata service                             | Promising direct route. Long text was incomplete in the observed sample.                                           |
| gallery-dl                              | Downloaded images/videos plus post metadata, including long text and text-only posts when configured | Self-operated Python tool. Source has guest and authenticated paths; actual guest coverage was not tested here | Better than yt-dlp alone for whole-post archiving. Evaluate inside the existing isolated preparation architecture. |
| twscrape                                | Full-text and media models from internal web GraphQL                                                 | Authorized X account sessions; session storage and account lifecycle                                           | Suitable if we accept operating a signed-in account. No live authenticated test.                                   |
| Twikit                                  | Full tweet text and photo/video/GIF models                                                           | Signed-in X session                                                                                            | Another library option. No live authenticated test or current reliability claim.                                   |

FxEmbed's current docs publish `/2/status/{id}` and retain older endpoints for compatibility. Its repository is MIT licensed and supports self-hosting. The public-host test does not establish service availability guarantees or permission for unlimited use. [API overview](https://docs.fxembed.com/api/introduction/), [repository](https://github.com/FxEmbed/FxEmbed).

Self-hosting avoids dependence on the public host but introduces deployment upkeep. FxEmbed documents account credentials as improving coverage and rates, with a lower-limit unauthenticated mode. It does not turn self-hosting into a guaranteed account-free route. [Credential documentation](https://docs.fxembed.com/deployment/credentials/).

Vercel's `getTweet` calls the public syndication endpoint. Its types include media details for images, video and GIFs, and identify `note_tweet` as a truncation marker. This is useful retrieval code even if no React embed is rendered. [Fetcher](https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts), [post types](https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/types/tweet.ts), [media types](https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/types/media.ts).

Gallery-dl's source selects long-form note text and extracts image/video metadata. Its `text-tweets` setting needs a metadata postprocessor with the post event to include text-only posts. Quotes/cards can be configured separately. The GitHub repository says active development moved to Codeberg; select and pin the current release before execution. It is GPLv2, so embedding/copying code needs a licence decision. A separately invoked worker executable is an architectural option, not a licence determination. [Extractor](https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/twitter.py), [configuration](https://gdl-org.github.io/docs/configuration.html#extractor-twitter-text-tweets), [project](https://github.com/mikf/gallery-dl).

Twscrape explicitly requires authorized accounts and stores sessions. Twikit's documented flow also logs in, despite needing no developer API key. This separates avoiding API fees from avoiding X authentication. Both repositories show MIT licensing. [Twscrape](https://github.com/vladkens/twscrape), [Twikit](https://github.com/d60/twikit), [Twikit tweet/media model](https://github.com/d60/twikit/blob/main/twikit/tweet.py).

I would not start with snscrape: its maintainer's broad X failure issue remains open. The n0madic Go scraper is archived. Their availability on GitHub does not establish current working extraction. [Snscrape issue996](https://github.com/JustAnotherArchivist/snscrape/issues/996), [archived Go scraper](https://github.com/n0madic/twitter-scraper).

## Observed public endpoint results

The probes used upstream documentation and extractor-test post IDs. They supplied no X login or developer key. Only public metadata, one image decode and one video HEAD were requested. No VibeScroll source was saved or processed. [Receipt](../operations/evidence/x-input-keyless-live-probe-20261110.json).

| Public sample                               | FxTwitter result                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Text-only post20                            | Correct post ID,24 text characters, no media                                   |
| Photo604341487988576256                     | Text and one direct image                                                      |
| Four-photo894001459754180609                | Text and four separate image entries                                           |
| Video1065692031626829824                    | Text and one video with four playback variants                                 |
| GIF1839019491835129889                      | Text and one GIF represented by an MP4 variant                                 |
| Mixed1577924293023133696                    | Text, one image and one video, in a combined media list                        |
| Long post1629193457112686592                | 756 text characters, note marker and one photo                                 |
| Older NASA623160978427936768                | Text returned but no media, despite the old downloader fixture expecting video |
| Older four-photo fixture1270755918330896395 | Application-level401; direct syndication returned a tombstone                  |

For the mixed sample, the returned image actually decoded at1800x2000. A direct MP4 HEAD returned HTTP200, `video/mp4` and44,958 bytes. The full video was not downloaded or decoded.

Direct syndication returned the same mixed sample with one photo and one video containing four variants. On the long sample, it returned304 text characters plus a note marker, compared with FxTwitter's756. This demonstrates a real completeness difference on one post, not a universal comparison.

The initial old fixtures and metadata-only success show why a200 result cannot mean complete coverage. Browser navigation status was not captured; the JSON `code` was. Live Vercel-network acceptance, original-post visual comparison, freshness and broad reliability remain untested.

## Fit into VibeScroll

Keep acquisition independent of analysis. A provider adapter should produce canonical post identity, source text, raw/display-text distinction, quote identity, media order, asset URLs/types, retrieval time and explicit completeness. FxTwitter and syndication have different response shapes; normalize them before analysis. Preserve literal author text separately from any cleaned display text and never substitute a quote's assets for the submitted post.

Use the existing caption evidence for post text, decode/inspect each image, and prepare each video/GIF through bounded media handling. The current one-video Cloud contract needs a versioned extension for multiple assets and text-only input, regardless of metadata provider. Validate returned CDN destinations before retrieval. Missing or inaccessible assets must remain visible as omissions. Neither a preview cover nor a missing-media200 response establishes the complete attachment set.

Recommended next scope is a backend-only FxTwitter-versus-direct-syndication adapter prototype, with static fixtures, then one permitted bounded preparation check. Keep gallery-dl as the self-operated candidate if a hosted metadata dependency is undesirable. No account cookies, new service deployment, paid provider or fallback chain was enabled. This research does not reopen MCP UI work or remove source-use and retention obligations.
