# Interest-led onboarding and pre-payment GitHub

Status: approved for implementation under R144. Production acceptance pending.

Date: November 1, 2026, Europe/Berlin.

## Decision

Use the [interest-led journey](../strategy/INTEREST-LED-ONBOARDING.md): interests and goal, a real already-analyzed starter result, account creation, optional GitHub/repository selection, Pro checkout, then a real project proposal and the existing Approve & create issue action. Importing Saved information is optional and cannot start unquoted processing.

Create accounts before payment so preferences, the selected post, authorization and checkout have a stable owner. Returning unpaid users resume at the paywall. Keep current valid GitHub authorization through the existing encrypted integration. Never store passwords, credentials or a full export in the quiz draft.

Mark only new verified accounts created after feature activation. An optional users.onboarding field stores bounded versioned progress. Existing accounts retain their recorded policy and do not repeat setup or payment. A first-verification path handles new identities created by an earlier webhook. No populated backfill, index change or new table is needed.

Ordinary workspace access and the MCP principal require the new account's own current Pro. Explicit setup exceptions allow authentication, personal workspace provisioning, GitHub connection/repository selection, checkout acceptance and account recovery. These exceptions grant no repository snapshot, AI processing, proposal publication or another member's credits. The server enforces access independently of redirects.

An explicit allowlist selects at most eighteen eligible service-owned catalog families. Anonymous metadata discloses at most six choices. A signed preview claim binds one selected family and a separate thumbnail claim cannot read insights. The Next adapter keeps claims in HttpOnly cookies and validates origin. Convex checks signatures, selection, current catalog authority and retention. Frame disclosure verifies actual size/hash/dimensions and rechecks authority before returning bytes. No admin catalog entitlement or private account projection is used. The one-preview browser limit is not a person-identity guarantee.

Use the existing Home visual language, shared insight controls, local export parser, WorkOS, Stripe and proposal composer. The first project guide reads the selected repository only after Pro and an explicit action. Users confirm their project context before drafting a plan. Plans reuse all retained source insights and the existing quoted generation/discussion/publication workflow. No automatic coding or duplicate media analysis follows.

## Acceptance

Separate isolated access/signature/replay tests, full checks, visual browser cases, actual compatible publication, canonical preview/signup/paywall and paid transaction acceptance. The owner prohibits a real operator payment, so no live charge is required or claimed. Verify sandbox provider delivery separately; do not manufacture a production paid account to bypass this limitation.

The original MCP app, legacy accounts, budgets, retained sources and unknown holds remain intact. Read the [execution ledger](../strategy/ONBOARDING-IMPLEMENTATION.md) for current evidence.
