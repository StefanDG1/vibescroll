# Cookies and similar storage

Status: published. Effective 20 November 2026. Version: 1.2.0. Release: analytics-2026-11-20.1.

## Essential storage

VibeScroller uses these first-party items on scroll.companynerve.com. The browser lifetime can be longer than the server session validity; an expired or revoked server session cannot grant access.

| Name                           | Provider and purpose                                                             | Duration                                                                             | Scope                                         |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| __Host-vibescroller-production | WorkOS AuthKit, encrypted sign-in session                                        | Up to 400 days in the browser, cleared by sign-out; server session limits also apply | This host, secure, HttpOnly, SameSite Lax     |
| wos-auth-verifier-*            | WorkOS AuthKit, verifies an individual PKCE sign-in request                      | 10 minutes maximum, removed after callback                                           | This host, secure in production, HttpOnly     |
| vs_consent                     | CookieConsent, remembers your categories, consent revision and choice timestamps | 180 days                                                                             | This host, SameSite Lax, secure in production |

Provider sign-in pages such as Google and WorkOS may have their own cookies on their own domains. Their policies apply when you visit those pages. They are not analytics permission for VibeScroller.

## Optional product analytics

PostHog EU Cloud receives optional, explicitly named product events only after you allow analytics. They describe workflow steps, coarse states and capped counts, such as an import completing or a proposal being rejected. We do not send your saved source text, caption, source URL, repository name or file content, email, workspace ID or page URL. Session replay, automatic click capture, surveys, advertising identifiers and AI prompt capture are disabled.

After you allow analytics, this site stores a random analytics identifier and limited campaign and checkout state in your browser tab. This lets us measure steps through sign-in and checkout returns. If you inspect app evidence or save a plan, the site can keep the random identifier in this browser for seven days to measure repeat use. The identifier contains no account ID. The consent choice cookie stores your preference. PostHog still receives network metadata such as your IP address.

Reject analytics is as accessible as Allow analytics. Preferences lets you choose again. Use Cookie preferences in the app's account menu, privacy screen or website footer to withdraw permission. Future event capture stops and the site clears its optional analytics storage. Signing out also clears the local analytics identifier. A request already sent cannot be recalled. Existing events follow the applicable privacy policy and the provider's configured retention. Do Not Track and Global Privacy Control also prevent analytics capture.

## Browser and PWA data

The PWA caches public application assets. It does not cache private transcripts or repository data in a shared service-worker cache. Instagram ZIP previews read the file on your device and send only the selected normalized Saved metadata when you confirm an import. The full archive is not uploaded by this workflow.

You can remove this site's data in your browser. Doing so can sign you out and remove unsent drafts. It does not delete records in your online account. Use app privacy settings for export and deletion.

## Changes

Changes to nonessential processing require the relevant consent. The retained publication record identifies this inventory and its implementation checks. Operator approval does not imply professional legal review.
