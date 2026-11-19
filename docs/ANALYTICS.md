# Product analytics

## Launch and onboarding

Open the [VibeScroll launch dashboard](https://eu.posthog.com/project/289940/dashboard/1133517). It contains the landing-to-evidence path, quiz and account progression, setup views and failures, checkout and verified access, first useful action, and repeat evidence use. It filters to journey version 2 and excludes `utm_source=qa`. Supported campaign codes are `founder_outreach`, `community` and `launch`. Other values and the full URL are omitted. Review the number of observed browser journeys before reading conversion rates.

The SDK still runs in memory without replay or autocapture. Under consent revision 2, the application keeps the random journey ID, campaign and checkout marker in tab storage. An observed signed-in evidence inspection or saved plan can retain the ID in the current browser for up to seven days. The retention chart covers consenting browsers with observed activity. It excludes sign-outs, unavailable storage and activity on another device unless independently observed there. It cannot establish the percentage of all visitors who accepted analytics.

`checkout_progress` records a request, returned Stripe checkout URL, failure or return from an open attempt. `returned_unfinished` is a return to billing without completion and may include a manual return. `pro_verified` describes access the app verified. Use Stripe and the matching entitlement ledger for verified live payments, refunds, and first purchasers. Do not connect or forward customer billing data to PostHog to infer payment from these browser events.

Dedicated project: VibeScroller, PostHog EU Cloud, project 289940. The public write-only project token is configured separately from the existing Exponential project's token. No personal API key is needed in the app. Free setup only; no new purchase.

## Events and denominators

| Event                | Meaning                                         | Allowed properties                   |
| -------------------- | ----------------------------------------------- | ------------------------------------ |
| page_viewed          | Sanitized public page class after consent       | Fixed page and surface enums; no URL |
| workspace_viewed     | App navigation after consent                    | Fixed view name                      |
| source_captured      | Server confirmed a capture                      | Input kind                           |
| import_previewed     | Local parser found selected Saved links         | Format, capped count                 |
| import_completed     | Server accepted the import                      | Accepted, duplicates, waiting counts |
| source_viewed        | User opened a source                            | Kind, processing state, coverage     |
| analysis_approved    | Server accepted separate analysis permission    | Funding route                        |
| analysis_completed   | The browser observed a transition to ready      | Funding route, coverage              |
| analysis_canceled    | Server accepted cancellation                    | None                                 |
| repository_connected | Server confirmed selected repository connection | None                                 |
| proposal_reviewed    | Server accepted the review decision             | Accepted, rejected or deferred       |
| plan_saved           | Server confirmed plan editing                   | None                                 |
| execution_approved   | Server accepted execution permission            | Local or cloud route                 |
| draft_pr_created     | Server returned from the trusted publisher      | None                                 |
| pr_reconciled        | Server returned from PR reconciliation          | None                                 |
| source_deleted       | Server accepted deletion                        | None                                 |
| operation_failed     | A named request was refused                     | Fixed operation and safe code        |

These events are opt-in browser observations, not authoritative billing or complete background-job records. Do not compute a global merge rate from pr_reconciled or imply a completed analysis equals an accepted proposal. Consent rejection, offline browsers and blockers create missing data. The backend's durable PR, billing and feedback records remain the authoritative denominators.

Recommended PostHog funnels: import_completed → source_viewed → analysis_approved → analysis_completed; repository_connected → proposal_reviewed → plan_saved → execution_approved → draft_pr_created. Segment by route and coverage. Show failures separately and preserve rejection as a valid result. No customer outcome or savings is established by these events.

## Privacy boundaries

CookieConsent runs in opt-in mode with equal accept and reject controls and a persistent preferences control. PostHog JS uses the no-external bundle loaded only after permission. There is no replay, automatic capture, page URL, flag, survey or prompt capture. A second allowlist in `before_send` drops unknown events and properties, including SDK URL and referrer defaults. Counts cap at 1,000. The capture token is the project's public write-only key. The app does not send source, email, account, workspace, repository or prompt identifiers.

Withdrawal stops future captures and clears optional browser storage. Capture checks the consent cookie again so withdrawal in another tab takes effect before the regular sync. Already-transmitted events cannot be unsent. Do Not Track and Global Privacy Control override a stored allow choice. Confirm the actual provider retention and production cookie inventory before broad acquisition.

## References

[PostHog Next.js documentation](https://posthog.com/docs/libraries/next-js), [PostHog JS](https://github.com/PostHog/posthog-js), [CookieConsent MIT repository](https://github.com/orestbida/cookieconsent), [CookieConsent React setup](https://cookieconsent.orestbida.com/essential/getting-started.html), [shadcn dropdown guidance](https://ui.shadcn.com/docs/components/dropdown-menu). Inspected 1 October 2026. Radix supplies accessible dropdown behavior; no competitor assets or production credentials are copied.
