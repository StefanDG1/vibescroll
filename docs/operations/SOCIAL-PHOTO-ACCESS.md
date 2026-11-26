# Approved access for social photo posts

Verified November 26, 2026. Use the original post link as the product input. A creator or approved provider can authorize access once, after which VibeScroll matches the original link to the permitted source.

## Instagram carousels

The existing Instagram Graph integration can read the carousel of a connected professional account. It resolves a saved permalink against the authorized account's indexed posts, checks the returned owner and media ID, and requires the complete child list. Each child's media URL is checked and its bytes are decoded in the isolated worker. The parent supplies the caption. This route needs an approved Meta app and a current connection for the account that owns the media. The live deployment had no configured Instagram feed authority during this check. [Meta media endpoint](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/v21.0/) · [VibeScroll intake decision](../adr/244-link-only-posts-and-creator-intake.md)

Instagram oEmbed supplies HTML for display. VibeScroll needs permission to obtain and retain each attachment as analysis evidence. For arbitrary public links outside connected accounts, use a provider agreement that explicitly covers those actions and the intended model processing. [Meta Instagram oEmbed reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/)

Enable creator discovery and configure the scoped Instagram feed for the connected account. Production Convex supports the Graph route with public ordered extraction and public embeds disabled. The saved link must match one indexed, authorized media ID. The preparation quote binds that ID, and dispatch checks the same binding again. If the grant expires, the job records a source access failure without a public fallback. [Release evidence](evidence/launch-20261126-approved-instagram-route.json)

### Public professional accounts through Business Discovery

Meta's Facebook Login Business Discovery API can return media for another public professional account. Configure the approved requester account and token separately from the target's handle and Graph account ID. An approved `VIBESCROLL_INSTAGRAM_FEEDS` record uses the target's Graph ID as `accountId` and `instagram:<target Graph ID>` as `creatorKey`. Set `businessDiscoveryRequesterId` to the requester's Graph Instagram account ID. Use a current Facebook Login token with the applicable Business Discovery scopes and a permission reference that covers retaining and analyzing the post.

Run the internal `creatorDiscovery:indexInstagramBusinessCreator` mutation with the approved target's `creatorKey` to seed its scheduled index. The index checks up to 20 returned entries per poll. Once the exact permalink is indexed, users can save it normally. Preparation rechecks the target Graph ID and handle, finds the exact media and permalink, and rejects incomplete albums. Dispatch checks up to four pages of five media entries. The target creator does not need a VibeScroll connection. Personal accounts and arbitrary historical lookups are outside this adapter. Production exposes the index entry point. A live carousel check needs an approved requester connection. [Meta documentation](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery) · [Release evidence](evidence/launch-20261126-instagram-business-discovery.json)

## TikTok Photo Mode

TikTok Data Portability is an official option for posts made by the account holder. TikTok requires Login Kit approval, Data Portability approval, and creator consent. The Posts and Profile export can supply JPEG downloads. Confirm that the permitted export can match a share link to its exact post ID and provide every photo in its original order before deploying an adapter. The current production configuration has no photo access grant. [Data Portability approval](https://developers.tiktok.com/doc/data-portability-api-get-started) · [Export fields](https://developers.tiktok.com/docs/en/data-portability-data-types)

TikTok's embed player can display a public Photo Mode post. The Display API describes access to video metadata, and Research Tools are limited to qualifying research. For arbitrary public Photo Mode links, obtain a licensed media feed or written TikTok authorization that covers this use. [Embed Player](https://developers.tiktok.com/docs/en/embed-player) · [Display API](https://developers.tiktok.com/docs/en/display-api-overview) · [Research Tools eligibility](https://developers.tiktok.com/products/research-api/)

## Production acceptance

For each platform, save one permitted original link through MCP. Confirm the exact source, caption, attachment count and order. Decode and retain each expected image. Run one reviewed standard managed or subscription analysis against that retained evidence. Verify Ready, cited insights and the actual JPEGs in the signed-in app and with MCP `fetch` and `read_post_frame`. Keep a source access failure visible if permission, identity or attachment completeness fails. A cover image or a successful video test does not verify a photo post.

The current Muse Contributor route is restricted to supported video analysis. For approved ordered photo evidence, use the subscription route or verify an enabled standard managed model under the no-prompt-training policy. [Managed TikTok video receipt](evidence/launch-20261126-tiktok-managed-and-native.json) · [Vercel data controls](https://vercel.com/blog/zdr-on-ai-gateway)
