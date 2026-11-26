# ADR 245: Publish complete retained posts to the shared library

Date: November 26, 2026. Status: accepted and deployed for shared publication. Creator and independent-user acceptance remain open.

## Decision

The owner requests repairing shared publication and completing creator matching and following. Public Instagram and TikTok acquisition stays enabled under the November 26 direction. Publishing a valid retained result must not require another extraction or model run.

Apply the standing shared policy to ordered posts and Graph acquisitions as well as legacy videos. The existing source attestation, current actor and workspace access, processing authority, immutable consent, storage allowance, evidence hashes and withdrawal checks still apply. An automatic request can only publish a version created after that request. Explicit contribution of an older version requires its exact consent, output hash, evidence hash and retention. An unresolved copy remains unresolved and cannot be restarted by repeating the request.

Accept the existing neutral post protocol. Copy up to the contract limit of 48 JPEGs, each at most 150,000 bytes and at most 7,200,000 bytes in total. Verify all bytes before uploading. Store distinct ordered references when two slides have identical bytes.

Ordered intake can reuse a complete post manifest. It cannot treat a legacy sampled-video result as complete carousel evidence. Receiving users keep separate private saves referencing the independent shared result. Carry verified creator identity, published date, caption and media positions into their readers and creator pages. Their Save must not create another preparation or consume analysis credits.

## Verification

Isolated tests cover legacy video, nine-image and 35-image publication, concurrent waiters, a subsequent cold-account Save, unchanged second-account credits, creator-page visibility, exact image references and explicit publication of a retained version. Existing policy and reuse tests remain required. Production recovery will use the existing nine-image Instagram and two-image TikTok results, with their original private versions retained.

Production recovered both retained results without a new model run. MCP read both shared contexts and all eleven JPEGs, and private version history remained intact. [Production receipt](../operations/evidence/launch-20261126-shared-photo-publication.json). Independent browser reuse, public creator polling, automatic identity matching and creator pool acceptance remain separate checks. Passing shared publication does not close those creator requirements.
