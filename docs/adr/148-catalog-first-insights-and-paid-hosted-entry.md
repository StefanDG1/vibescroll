# ADR 148: catalog-first insights and paid hosted entry

Date: October 24, 2026. Status: owner-authorized direction; implementation and production acceptance pending. This extends ADRs 122, 146 and 147. It does not change current production permissions or publish existing private material.

## Owner decision

Generic video analysis must not ask the hosted user which workspace receives its insights. Eligible neutral analysis belongs in the existing shared catalog. Keep workspace tenancy for private project work and collaboration behind that simpler journey. Self-hosted open-source deployments have their own private data and do not automatically receive the proprietary hosted catalog or its credentials.

After account creation, the hosted user must pay before entering the product. Unpaid accounts retain their account and saved data but cannot read or use the app until payment resumes. A month without payment does not delete the account or its library. Subscription lapse alone must not schedule content deletion. Explicit user deletion, source-rights expiry, already-approved evidence retention and safety/takedown rules remain distinct from billing status.

The owner clarified paid hosted entry, rather than approving anonymous access to the catalog. Preserve ADR 122's existing Pro-only catalog entitlement, valid own-result origin and saved-copy rules. While unpaid, retained copies are stored but app access is locked; a valid paid entitlement restores access under the applicable tier. Do not invent a new price, free trial, lifetime offer or subscription credit from this decision.

## Teams and private state

Create an inviteable default team named from the user's available display name, for example Full Name's team. Bound the name and use a neutral fallback when the name is unavailable. Do not expose a private email address as a team name. Users may invite collaborators and create additional named teams through existing organization controls and limits. An invitation supplies membership, not a hosted payment entitlement.

Keep private notes, personalization, repository context, proposals, plans, credentials and team membership out of generic catalog output. Resolve any necessary owner-private processing home internally. Do not force the user to create or select it to analyze a public video. Preserve existing source IDs, source authority, consent, exact execution grants and unresolved jobs. Do not silently rename a custom team, strip private ownership, move old content or publish legacy/private analysis.

## Extend existing systems

`organizations.create(name)` already creates inviteable teams. `ensureDefault` currently creates an owner-private library, which rejects invitations. A naming-only change would advertise collaboration that the backend forbids. Removing its ownership flag would break current Cloud, setup, filing, creator and catalog boundaries. Implement visible teams and internal processing resolution together.

Extend the existing source/job/grant/lease and artifact/import systems. Current Cloud output is private-only; the service artifact producer binds managed funding, creator rights and configured service authority. An own-subscription result cannot be published by changing a flag. Add a reviewed neutral-contribution adapter with exact source/actor/job/policy, rights, contribution consent, funding route and authenticated provenance. Publish a strict neutral projection, never a spread of the private source record. Preserve immutable reuse, moderation, entitlement, expiry and withdrawal.

Enforce hosted payment on the server for product pages, APIs, MCP reads/actions, exports/assets and new background work. A frontend redirect is insufficient. Resolve the authenticated user's billing authority across teams without inheriting another member's unrelated subscription. Reuse existing Stripe state, billing records and identity; do not fabricate paid state or silently replace existing customers/subscriptions. Reject stale provider observations and unlock only from verified payment evidence.

Payment lapse must not strand an already approved job's usage or cleanup. Permit only narrowly scoped existing-job cancellation, failure/completion receipts, settlement and retention maintenance under unchanged exact principal, grant, task, generation and lease authority. These operations may record bounded outcomes but expose no protected content and authorize no new claim, input retrieval, lease extension, inference or unrelated work while unpaid. Stop the host through the supported cancellation/authority path; preserve unknown outcomes. This is an internal settlement exception, not unpaid app access.

Keep sign-in, checkout, billing management, recovery and required account/privacy controls outside the product lock so an unpaid person can pay or manage their account. Self-hosted operation needs a trusted deployment boundary, not a caller-supplied hosted exemption. Protect the proprietary catalog independently.

## Root-owned execution sequence

These additions extend the complete October 22/23 R/P/N/C/M scope; they replace no unfinished creator, media, Apply, website, Stripe or independent acceptance. Root owns shared contracts, implementation, integration, the cumulative ledger and final review.

1. Define one account-level paid-entry contract over existing billing authority. Test new/unpaid, paid, paid-through cancellation, expired/unpaid, refunds, stale provider state, lapse during in-flight work and resubscription with unchanged data. Prove protected-content/new-work denial alongside narrowly scoped prior-job settlement/cancellation/cleanup. No trial/credit balance or invited membership bypasses the hosted gate.
2. Resolve the internal private processing home and visible inviteable default team together. Test repeat/concurrent provisioning, unavailable names, existing private/team accounts, custom names, deletion in progress, additional teams and collaborators. Preserve cross-account isolation and existing source IDs.
3. Add eligible neutral own-subscription contribution to the existing artifact pipeline. Preserve the private protocol for existing jobs and personal routes. Test private-field exclusion, rights/consent, entitlement, cancellation, provenance, cache compatibility, withdrawal and retained copies.
4. Simplify Library/analysis/setup so generic insight intake has no workspace destination selector. Keep collaboration controls in team/account settings. Apply the paid gate across UI/API/MCP delivery. Explain the actual task handoff without claiming automatic dispatch.
5. Complete the approved real saved-source test, with and without GitHub, from a phone through Work Cloud. Verify actual acquisition, speech and sampled frames, canonical cited return, measured speed and denied/expired authority. Leave the reserved post untouched. Fund the whole stage and future cleanup before dispatch.

## Hosting and test limits

Keep fixed Basic builds and ordinary queued execution. Vercel's Hobby plan is restricted to personal non-commercial use. Basic on a paid team is USD 0.007 per build minute before applicable included credit. The latest completed build reports two billable minutes, about USD 0.014 gross; the ledger retains five minutes, USD 0.035. The original 45-minute reservation was not a measured charge. Local/CI prebuilt upload is a future release-cost optimization after environment/version/skew compatibility is verified. Hosting runtime/storage remain; customers' laptops are not required for that release process or intended Cloud analysis.

Official references checked October 24: [Hobby](https://vercel.com/docs/plans/hobby), [build machines](https://vercel.com/docs/builds/managing-builds), [Pro credit](https://vercel.com/docs/plans/pro-plan), [prebuilt deployment](https://vercel.com/docs/cli/deploy#prebuilt), [ChatGPT Work on a phone](https://developers.openai.com/training/walkthroughs/working-on-your-phone).

Cloud tools are connected, but a complete production Cloud video result is unverified. The same USD 3 cap retains USD 2.7245537334355747, leaving USD 0.2754462665644253. A whole new-source experiment has an approximately USD 0.85 conditional planning envelope and unresolved fiscal/host assumptions. Do not start production preflight or analysis without a proven whole-run bound. No purchases, plan downgrade, live Stripe product/charge changes, paid API fallback, provider-gate removal or existing-data publication follows from this ADR.

## Phone acceptance when ready

No new saved video or repeated OAuth reconnection is currently needed. Check that Work is available in the owner's ChatGPT mobile app and VibeScroll is connected. Once the integrated production stage is ready and fiscally authorized, root supplies the exact source page and prepared handoff. The owner reviews one-source processing permission and uses Work Cloud, with no local/Remote fallback. Handle supported provider-domain Internet permission or a real Cloud-browser sign-in only when requested by the host. GitHub is needed for repository application, not video analysis. Success requires the cited result to return to VibeScroll while the laptop is off; a connected tool or copied prompt is insufficient.
