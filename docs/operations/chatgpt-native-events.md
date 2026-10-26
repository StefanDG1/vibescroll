# Set up ChatGPT native Events

Mode: how-to. Last verified October 26, 2026. Private owner pilot only.

## What passed

The owner created and authenticated a parallel **VibeScroll Events test** plugin. Its detail page discovered all three serving Events and twenty tools. A native Work monitor subscribed to `work_cloud_connection_verified`, verified the signed callback and produced two separate `VibeScroll event received: work_cloud_connection_verified` replies. No follow-up user message triggered either reply. The second followed an operator pause and resume. A normal page reload was needed to see the replies in the open browser.

The same initial subscription renewed beyond its original OAuth-bound expiry without another login or user message. This verifies automatic renewal for this account and test window. It does not promise credentials will remain valid forever. See the [sanitized live receipt](evidence/launch-20261026-chatgpt-native-events.json).

The original plugin remains installed. Its older discovery lacked Events and a first Work setup attempt failed without subscribing. Fresh registration fixed discovery in this test; the old negotiation and exact OAuth request were not captured, so neither token scopes nor protocol fallback is a confirmed root cause. Deleting the original app was unnecessary.

The temporary connection monitor is now paused. Normal unsubscribe removed its encrypted subscription authority and delivery rows. The plugin stays authenticated. No new source, media download, analysis, credit reservation, paid inference or deployment occurred during this proof. Literal app-save acknowledgement is a separate, unpublished candidate under [ADR 160](../adr/160-native-events-and-saved-video-acknowledgement.md).

## Operator registration for this development test

1. Open ChatGPT web, then Plugins, Add, Add custom MCP server. Keep the original VibeScroll plugin.
2. Enter name `VibeScroll Events test`, server URL `https://scroll.companynerve.com/mcp` and OAuth authentication.
3. In advanced settings, use User-Defined OAuth Client with the existing public client `client_01M4A7H6291K149CVSQ9AED05M`. Leave the client secret blank and token endpoint auth method `none`. Use S256 PKCE. DCR and CIMD being unavailable is expected for this manual registration. Leave Registration URL blank; do not enter an example URL.
4. Preserve the discovered issuer `https://smooth-food-20.authkit.app`, authorization `/oauth2/authorize`, token `/oauth2/token`, and resource `https://scroll.companynerve.com/mcp`. Enable OIDC with the issuer's `/.well-known/openid-configuration` and `/oauth2/userinfo` endpoints.
5. Select the nine implemented default scopes: `knowledge:read`, `context:read`, `links:save`, `jobs:read`, `analysis:request`, `analysis:execute`, `feedback:write`, `suggestions:draft`, `events:subscribe`. Use base scopes `openid, profile, email, offline_access, events:subscribe`. These settings must match the operator's registered WorkOS client and serving registry.
6. Check the exact callback ChatGPT displays against the registered WorkOS redirect. The successful test callback was `https://chatgpt.com/connector/oauth/VafkgCjZiPmA`. A different installation can display a different callback; the operator must register the exact value rather than assume this example applies.
7. The account owner reviews the risk acknowledgement, creates the plugin and completes OAuth consent. No agent should handle the password, MFA, consent code, access token or refresh token.
8. In VibeScroll Connections, retain the reviewed scope and active grant. The test used the owner's existing all-library, until-revoked grant version 8 and explicit per-source Cloud policy. Profile Events still require the existing eligible private-owner pilot and Events/request/execution permissions. Acknowledgement does not widen that authority.
9. Confirm the plugin page actually lists Events. In a fresh Work chat, select the plugin and ask for a native event monitor for `work_cloud_connection_verified`, with the actual `profileId` and `grantVersion`. Ask it to reply exactly `VibeScroll event received: work_cloud_connection_verified`, without analysis, downloading, paid APIs, credits or polling. Let the setup turn finish. The supported host creates its own callback and signing secret; never invent them or paste them into chat.
10. Verify the later reply, subscription renewal and pause/unsubscribe behavior. An HTTP 2xx callback receipt alone is insufficient. Use the native Scheduled page to pause only the test monitor when finished. Do not select Run now as evidence of an event-triggered reply.

## How authentication and renewal work

ChatGPT is the OAuth client. WorkOS authenticates the VibeScroll user and issues scoped, resource-bound credentials. ChatGPT keeps the provider credentials and refreshes authenticated access. VibeScroll validates the bearer signature, issuer, resource audience, expiry, registered client, scopes and current provider identity. The same WorkOS subject identifies the existing VibeScroll user, rather than creating a shared database login.

The backend separately checks current workspace membership and the user's VibeScroll grant. That grant limits library access and permitted actions and can last until revoked. The database remains private. A valid OAuth token cannot bypass a revoked app grant or another workspace's authorization.

The native monitor subscribes through MCP Events. VibeScroll verifies callback ownership, encrypts the finite delivery credentials and rechecks current permissions before delivery. ChatGPT renews before `refreshBefore`. The server keeps its maximum thirty-minute lifetime and earlier OAuth/grant-expiry bound. In the live test the original expiry was about five minutes, and automatic renewal extended it without user interaction. An until-revoked app grant, short-lived OAuth access and a renewable event subscription are three separate lifetimes. Disconnects, revocation, provider restrictions or invalid credentials can still require reconnecting.

The serving code uses `@modelcontextprotocol/server` 2.3.1. Modern wire tests use revision `2026-07-28` and exercise `server/discover`, `events/list`, `events/subscribe` and `events/unsubscribe`. These are native protocol methods, so they need not appear as ordinary model tools. The live account successfully used the native lifecycle; its exact negotiated wire revision was not separately captured.

## Customer setup target and next test

The operator configures and distributes the plugin once after its separate release/provider/privacy gates pass. Customers should install it, authorize their own VibeScroll account, review their app grant once and create one persistent native monitor. Each customer uses their own supported ChatGPT subscription and identity. This test used Work on the owner's web account and required no Workspace Agents.

The unpublished `video_link_saved` candidate hooks the existing authorized single-link capture. It emits only post identity, generation, grant version and a protected direct post link. It skips bulk imports, supplied text and non-video URLs. Explicit re-saving can acknowledge an existing post without changing its data or analysis. Duplicate saves coalesce while the corresponding delivery record remains retained, with terminal records currently cleaned after 24 hours. Delivery itself is at least once and retains its stable event ID on retry.

After publication, discover that new event and configure an acknowledgement-only monitor for it. Turn automatic analysis off and confirm the app button says **Save source**, then re-save one existing permitted Reel through the actual app, verify the subsequent native reply and unchanged source/analysis/generation, then pause the canary. Keep both TikToks, unknown work and old repair leases untouched. This real app-save check must pass before moving to automatic media analysis. Future analysis-on-save still needs its own standing-authority and media-runtime acceptance; a saved-link notification grants neither.

Sources: [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events), [plugin packaging](https://developers.openai.com/plugins/build/plugins), [OpenAI examples](https://developers.openai.com/plugins/build/examples). The linked Pizzaz Node example uses the older SDK/SSE interface and is not an Events implementation template.

The [concrete release proposal](evidence/launch-20261026-saved-link-release-proposal.json) retains all existing budget holds. It reserves nothing and authorizes no publication until the owner resolves the EUR7 funding boundary.
