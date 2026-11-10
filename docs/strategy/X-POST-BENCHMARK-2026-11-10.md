# X input tool comparison on recent owner shares

Mode: measured research. November 10, 2026, Europe/Berlin. R160 expands R159 from feasibility to testing the owner's recent failed X shares and analyzing their content. Raw responses, chat mappings, media evidence and individual analyses remain in ignored private operator outputs. No application implementation or release occurred.

## Finding

Gallery-dl1.32.19 is the strongest self-operated candidate in this bounded corpus. It retrieved complete text and direct media enumeration for all four selected posts without an X login or paid developer key. A second pass succeeded again. FxTwitter/FxEmbed also retrieved all four. The two methods agreed on normalized text and attachment counts.

The selected corpus has two videos, a text/outbound-link post and a long text-only post. This is not a broad reliability percentage or proof of every X format. Earlier public-fixture image/GIF results remain separate.

| Executed tool               | Observed behavior                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| gallery-dl1.32.19           | Four complete results, repeated; guest access worked                                          |
| Public FxTwitter v2         | Four complete results; no caller account/key                                                  |
| Project yt-dlp2026.10.21    | Both videos worked; non-video cases failed or followed an external link                       |
| react-tweet3.3.1 `getTweet` | Returned all IDs but truncated the long post to280 of1,684 characters                         |
| Direct syndication          | Same long-text limitation; not independent of react-tweet                                     |
| Twikit2.3.3                 | Guest/account initialization failed; fresh-client diagnostic could not obtain signing indices |
| twscrape0.21.0              | Account test failed on signing-script parsing with both default and httpx transports          |

The library failures occurred before useful post retrieval. They do not establish inaccessible source content. No account rotation or repeated login was attempted. Exact result summaries and diagnostics are retained privately.

## Evidence quality

Both video URLs decoded at their declared full dimensions. Thirty-six timestamped frames were inspected across the two videos. Browser-decoded audio was checked separately: one track was digital silence; the other produced no detected English speech segments in a bounded research ASR pass. The text/link and long-text posts had no direct media attachments, which is valid successful coverage.

The individual analyses separate visible patterns from unsupported revenue, conversion and prescribed-effort claims. The linked design resource was inspected as a separate web page, not reclassified as an attachment. None of these analyses was represented as a native VibeScroll Ready result.

Observed process/navigation times differ in transport, startup and cache state; they do not establish a fair speed ranking. The recommendation rests on completeness and avoiding account-session operation. The same-day repeated corpus remains small and partly cache-served.

## Recommended integration candidate

Use gallery-dl for bounded whole-post retrieval and FxTwitter for a separately selected fallback. Keep yt-dlp and the existing isolated FFmpeg preparation for media, then analyze retained text and actual media evidence. A syndication fallback must detect long-post truncation. Do not chain providers to bypass authorization or private-content refusals.

Preserve canonical post identity, original/display text, outgoing links, attachment order and explicit zero/partial media coverage. The existing one-video Cloud worker and X URL rejection still need a versioned extension. Gallery-dl's GPLv2 packaging is an implementation decision to review before embedding or distributing it.

No production dependency changed. Research tools were installed only in an ignored isolated environment. The existing X session was used transiently for the requested account-based tool comparison; temporary account databases were removed. No paid model request, provider purchase, wallet mutation, deployment or unknown-job replay occurred. Product local execution and MCP UI remain deferred.

References: [gallery-dl](https://github.com/mikf/gallery-dl), [FxEmbed](https://github.com/FxEmbed/FxEmbed), [react-tweet](https://github.com/vercel/react-tweet), [Twikit](https://github.com/d60/twikit), [twscrape](https://github.com/vladkens/twscrape). The [initial research](X-POST-INPUT-FEASIBILITY-2026-11-10.md) and [non-paid-API options](X-POST-NON-API-OPTIONS-2026-11-10.md) remain background, with this measured corpus superseding their untested tool preference.
