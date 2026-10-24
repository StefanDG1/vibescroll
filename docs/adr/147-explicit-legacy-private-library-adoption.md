# ADR 147: explicit private-library adoption for older sole-owner workspaces

Date: October 24, 2026. Status: reviewed implementation candidate; live adoption pending.

## Problem

The real founder-account connection exposed all six Cloud tools after normal OAuth reconnection, but a bounded app read showed that its older saved-link workspace has no `privateOwnerId`. It is governed by team membership even though its name is Personal workspace. The selected Reel remains generation 0 with no analysis. Cloud correctly requires an owner-private library. New accounts already receive one; `createPrivate` deliberately leaves legacy content in place. Creating a second library would not repair the original saved post.

## Decision

Extend the existing organization and Team controls with an explicit preview and adoption. Keep the existing organization, source and project IDs. Do not copy data, create another analysis store or reinterpret the workspace name. The original creator must be the sole current member and owner, with no active invitations and no other private library, including one being deleted.

The preview uses bounded indexed reads, refuses a saturated invitation check and returns a five-minute identity snapshot. The mutation requires recent app authentication, explicit private-only acknowledgement and an unchanged snapshot. It atomically rechecks membership, invitations and other private ownership before patching only the ownership field and writing an audit. A current already-private snapshot can return harmlessly; an old pre-adoption snapshot is stale. The snapshot is a comparison value, not a secret or cryptographic authority.

The existing private-workspace read, invite acceptance/creation and ownership-transfer checks enforce the result. No default, billing entitlement, source, processing job or assistant grant changes. A team still uses a separate team workspace. The source detail offers only an eligible owner a repair link; it does not enable Cloud or start an analysis. The control loads a preview only after an explicit click and clears acknowledgement after errors or a new review.

## Evidence and release

The backend focused suite passes 26 cases, including source/ID preservation, authority denial, stale snapshots, newly added members/invitations, restore lock and private invitation refusal. Eight UI cases exercise explicit review/acknowledgement, invalid/expired replies, failures and duplicate suppression. Native synthetic review covers 320 dark/reduced-motion and 1280 light, keyboard acknowledgement, exact payload and refusal without overflow. Independent High review found no P1/P2. Root owns the combined checks, compatible publication and live acceptance; their receipts remain separate.

A live mutation still needs a fresh eligible production preview and the operator's concrete private-only approval. Keep the original US$3 cumulative cap and retained unknown/future holds. The full-main index migration, public commercial Cloud access, shared catalog publication and actual real-video return remain separate gates. No permission is weakened to pass this test.
