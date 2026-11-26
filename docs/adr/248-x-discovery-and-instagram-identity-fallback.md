# X discovery and authenticated Instagram identity fallback

26 November 2026.

The owner requests reliable public post intake, creator following and shared reuse across Instagram, TikTok and X. Keep original results and credit holds while completing those paths.

## Instagram metadata fallback

The first production metadata pass indexed 56 of 59 selected shared results. Three Instagram posts returned an embed shell without usable author metadata. The already approved Instagram session resolved two through the fixed first-party media-info endpoint. The third returned post unavailable. This confirms a technical difference between a disabled embed and an unavailable post.

Use the authenticated endpoint only when public embed identity is unavailable. Convert the exact shortcode to its numeric media ID and verify the returned shortcode, one result, stable owner ID and public account. Preserve the finite validated session and send its three cookies only to Instagram with redirects disabled. An ambiguous or mismatched public embed must fail rather than trigger a different identity. Record `instagram_media_api` as the proof method. Never claim this metadata fallback acquires a complete media manifest. Refresh authenticated Instagram profile observations for matching through the same bounded session. Newly repaired source identities schedule the ordinary matching path.

## X profile and timeline reads

FxTwitter is now maintained in [FxEmbed](https://github.com/FxEmbed/FxEmbed). Its [current API documentation](https://github.com/FxEmbed/FxEmbed/blob/main/docs/src/content/docs/api/introduction.mdx) describes the v2 endpoints. The old profile route returned 404 in the server probe, while X's syndication timeline returned 429. FxEmbed's current timeline returned 17 own posts, including four videos and 13 text or photo posts, through the compiled adapter.

Read `/2/profile/id:<stable-id>/statuses` with a descriptive VibeScroll User-Agent, a 20-post request, a bounded response and an opaque continuation cursor. Read `/2/status/<post-id>` for missing post-author metadata. No Instagram session or other user credential goes to FxEmbed. Verify author IDs, public status, post IDs, canonical URLs, dates and cursor progress. Skip reposts from other authors. Do not treat a matching handle alone as proof that two accounts belong to one person. Matching continues to require reciprocal public links or an existing manual correction.

Text and image posts have zero video duration. Sum the durations of attached videos when the feed reports them. Missing duration remains unknown and uses the conservative existing preparation quote. A complete feed check and a new sponsored analysis are separate assertions. Follow does not analyze historical posts published before the user's contribution-enabled follow.

## Shared X publication

Extend the existing user-attested automatic policy to X under the owner's public-post direction. It is a recorded user declaration, not an independently verified licence. Validate current funding, source retention, creator identity and complete retained post evidence before sharing. Keep private overlays excluded.

Adding X must not invalidate publication already admitted for Instagram or TikTok. Their policy identity continues to hash the same prior platform list. X has a separate platform identity. The completion check uses the same identity calculation as admission. Tests cover zero-duration X sponsorship and a complete text-only X result progressing to shared publication and its creator page while retaining the original private analysis version.

This package does not change model tariffs, billing, grants, the daily provider ceiling, unknown job holds, existing result selection rules or website contracts. Existing private X results require an explicit retained-version contribution; never backdate an automatic request to publish them. A separate internal metadata repair can verify an exact ready private post, then add only its creator and platform post key. It rechecks generation, selected version, rights and retention, keeps source revisions unchanged and publishes no private content. Production acceptance must record actual feed reads, publication and user reuse separately from isolated tests.
