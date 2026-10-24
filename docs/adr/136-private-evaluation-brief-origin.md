# ADR 136: private evaluation brief origin

Status: locally verified implementation candidate; exact-head CI and release pending. Date: October 24, 2026.

## Decision

Extend the existing own-subscription project-evaluation task with an optional private focus brief. Reuse its quotes, approvals, leases, controller, repository inspection, evaluations, proposals, issue drafts, improvements and plans. Do not create another analysis store, queue, profile producer or executor. This is a C6 personalization slice, not proof of the official Cloud project/plan route.

Accept `privateEvaluationBrief?: string` only for project evaluation in a workspace whose current `privateOwnerId` is the server actor. Ordinary tasks and team-workspace behavior stay unchanged. A supplied brief must contain non-whitespace text, fit 4,000 UTF-8 bytes, have well-formed Unicode and contain no unsafe control characters or detected secret. Preserve exact accepted text. The app omits an empty field and invalidates quote/consent whenever the input changes.

The server creates `privateEvaluationOrigin` with schema version 1.0.0, kind `private_evaluation_brief`, owner, SHA256 of the exact brief, model and reasoning effort. Store raw text only on the private approved task. Copy the immutable origin, without raw text, onto its existing evaluation, proposal, issue draft and improvement. Bind quote, approval, currentness, completion and inherited plan approval to this origin. Status and history disclose a private-context label, not the text.

Keep the default evaluation key byte-for-byte unchanged. A custom evaluation appends a versioned hash of the complete origin, separating owners, briefs and requested model/effort. Custom history matches the same origin. Neutral evaluation, managed evaluation and business-profile history exclude custom origins. Never overwrite canonical source analysis or shared artifacts with a personalized project judgment.

Plan drafting rejects a caller-provided brief and inherits the accepted proposal's immutable origin under its own approval. Preserve the existing editable plan and manual changes. Existing authorized assistant reads, private issue drafting, manual issue edit/export and exact reviewed publication remain supported. Carry origin through issue/improvement/proposal currentness. Exclude custom improvements from standing-policy automatic selection and recheck before any automatic reservation. Manual exact coding approval remains separate and available.

Existing private-workspace access, export and deletion remain authoritative. Recovery must not revive task authority or turn a custom result into neutral data; retain its origin marker while clearing the existing task/output authority as required. Source/repository generations, selected scope, cost/unknown-state holds and the controller's single active official-client execution remain unchanged.

The existing coordinator forwards the leased server context into the structured model input. Preserve the current operation/protocol and default behavior where this remains compatible. This supplies model context, not an attestation that the model followed every instruction. Untrusted source, repository and brief text cannot grant tools, spending, publication or code execution.

## Ownership and acceptance

Root owns serialized fields, schema, contracts, integration and final review. A High agent owns backend/context/lineage and relevant tests; a Medium agent owns the existing advanced UI and its tests. Verify default keys, UTF-8 limits, private-owner checks, quote tampering, cache separation, neutral histories, current lineage, inherited plan approval, explicit issue flow, automatic-policy exclusion and export/recovery. Independent review and actual checks will be recorded before a draft PR.

[The receipt](../operations/evidence/launch-20261024-private-evaluation-brief.json) records 1,659 passing integrated offline tests with three hosted skips, all types, both builds and seventeen finance checks. Backend ninety-case and UI twenty-three-case focused checks passed. Independent High review found no P1/P2. Final optional origin labels passed all 170 public UI cases, starter types and scoped lint after the full check. Retain the corrected type/fixture/lint failures and require exact-head CI for the final committed source.

Skills, team-private overlays, official Cloud project/plan authority, real model usefulness and production/independent acceptance remain open. No new provider, commercial permission, hosted request, price, quantity, purchase or deployment is authorized by this slice. Keep the cumulative US$3 cap and all prior unknown holds.
