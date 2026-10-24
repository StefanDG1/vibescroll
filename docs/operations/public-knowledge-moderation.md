# Review a public edition report

Status: implemented candidate, not activated or production acceptance.

An operator must have a current signed-in WorkOS identity listed in `PUBLIC_MODERATOR_SUBJECTS_JSON`. Workspace ownership does not grant moderation authority. Configure that list only through the separately approved operator change process.

1. Open `/app/moderation` in the reviewed application. Select **Load reports** to request at most fifty open reports. Loading is explicit and does not poll.
2. Inspect a selected report. The server returns the currently permitted public edition only. Removed, expired or changed evidence can be unavailable; that does not authorize retrieval of a private copy.
3. Review the reason and current edition, then explicitly confirm dismissal or removal for that report. A fresh sign-in is required for either decision. If access changed, use the offered sign-in repair and reload the report before deciding again.
4. Record the operator decision through the existing support process without copying private source text or account credentials into issues. Removal creates a durable restriction checked before preparation, publication, reading and reuse. It covers the source, the publisher's same canonical source across workspaces, and the original workspace's same canonical source across administrators. It does not restrict unrelated publishers in unrelated workspaces. Previously disclosed copies cannot be silently recalled.

## Release a restriction

1. Select **Load active restrictions**. Each explicit page contains at most 25 metadata records. Use **Load next restrictions** to inspect another page. No source content is retrieved by this list.
2. Select **Review release** for the exact restriction. Record a reason without source text or credentials. Confirm the separate release checkbox, then select **Confirm restriction release**. The backend rechecks the current moderator allowlist, fresh sign-in and expected restriction version. Reload after a refusal; an old confirmation cannot authorize a changed version.
3. Verify the release receipt. Release never republishes an edition, restores deleted content or grants source rights. The publisher must prepare and approve a new exact edition under current permissions and expiry. Withdrawal, re-preparation, a new slug and content/account/workspace deletion cannot themselves clear a restriction.

The safety record retains only opaque source/workspace/publisher/report/moderator identities, the canonical identity hash, bounded reason/decision notes and versions/dates. Content purge does not remove it. Restore quarantine preserves it. Actor scope refers to the retained actor ID; this does not claim to identify an entirely recreated account with a different ID.

## Normalize legacy removals before broad activation

Legacy removed reports or moderation-marked editions without a durable block hold publication, anonymous access and reuse closed. The pending check uses constant indexed reads. Do not remove old reports to bypass it.

Under a separately approved deployment and operation budget, invoke internal `publicKnowledge.normalizeLegacyModeration` with `{}`. Each explicit call processes at most five candidates. Repeat while the returned `done` is false. The result contains `normalized`, `pendingReports` and `pendingEditions`; those IDs remain operator-private. There is no automatic polling or scheduled provider work. Source/workspace deletion also preserves known legacy restrictions before erasing content identities, using five-edition batches.

When a canonical identity is missing, normalization does not invent it or pardon the removal. Recover its original metadata from the reviewed moderation evidence. In the moderator page, open **Repair a legacy moderation identity**, supply the retained edition ID/version, the original report ID when available, the SHA-256 of the original exact `source.canonical`, and a bounded repair-evidence note. Review and explicitly confirm the repair. The backend verifies any still-retained source identity; repair creates or preserves an active restriction and cannot release or publish it. When the edition itself is missing, first recover the original identity metadata through the separately approved recovery procedure. Never substitute another source or a guessed hash.

Historical report/moderator identities can genuinely be unknown. Such records use the discriminated `legacy_removal` origin and retain those fields as unknown. New removals always require their exact report and moderator. Re-run the bounded normalization check until `done: true` before broad publication. Apply the separate release procedure only when an authorized moderator decides the restriction should end.

The report queue contains bounded metadata. Edition inspection is a separate authorized request. UI state clears after an error. Keep the public web and provider gates closed until their separate acceptance passes. No moderation action was performed during candidate implementation.
