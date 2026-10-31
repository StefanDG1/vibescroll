# ADR 166: consistent eligibility for automatic Cloud saves

Date: October 26, 2026. Status: candidate; backend publication and automatic media acceptance pending.

## Problem

The actual original Personal workspace supports explicit Work Cloud requests through the existing `workCloudSourceEligible` predicate. It is an original sole-owner workspace with a separate private library. Private adoption correctly refuses `other_private_workspace`; moving or converting saved data is unnecessary. The automatic-Save candidate added separate `privateOwnerId` requirements, hiding its defaults and rejecting the same owner's finite Save intents. Seven focused regressions reproduced this mismatch.

## Decision

Reuse the existing execution-eligibility predicate for automatic-Save setup, reviewed defaults, route selection and intent validation. It requires an active workspace and current owner membership. A private library must belong to that owner. An older workspace additionally requires the original creator, exactly one member, no active invitations and a nonsaturated bounded invitation check. Existing Cloud claim/input/lease checks use this predicate too.

This does not adopt, copy, rename or merge libraries. Keep every organization, source, project and grant identity. Old grants gain no defaults or automatic intent. The owner must review the separate automatic-Save defaults once; each actual Save binds its own finite source intent. Current grant, client, media policy, model, effort, retention, rights and zero-API funding checks remain.

Recheck eligibility when displaying setup, reviewing defaults, presenting the route, creating an intent and consuming it. A new member, invitation, changed creator or lost ownership stops the route and intent. Existing runtime checks also stop claim and lease use. Do not treat the workspace's name as authority or widen sharing permissions.

## Verification and release

The focused compatible suite passes 77 tests. Seven new cases cover the original workspace alongside another private library, unchanged organization/source identities, eligibility loss through five independent changes, and no automatic authority for an older grant. The initial seven failures remain in ignored logs. Full checks and exact CI are recorded separately.

No schema, index, component or frontend change is required. Publish only the reviewed backend after exact CI and fresh no-scan proof. The shared EUR9.50 cap includes a further USD0.03 conservative backend/read/verification reservation; every older hold stays intact. Actual app-Save-to-retained-result acceptance, reserved/unknown posts and provider/privacy gates remain separate.
