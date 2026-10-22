# Review a public edition report

Status: implemented candidate, not activated or production acceptance.

An operator must have a current signed-in WorkOS identity listed in `PUBLIC_MODERATOR_SUBJECTS_JSON`. Workspace ownership does not grant moderation authority. Configure that list only through the separately approved operator change process.

1. Open `/app/moderation` in the reviewed application. Select **Load reports** to request at most fifty open reports. Loading is explicit and does not poll.
2. Inspect a selected report. The server returns the currently permitted public edition only. Removed, expired or changed evidence can be unavailable; that does not authorize retrieval of a private copy.
3. Review the reason and current edition, then explicitly confirm dismissal or removal for that report. A fresh sign-in is required for either decision. If access changed, use the offered sign-in repair and reload the report before deciding again.
4. Record the operator decision through the existing support process without copying private source text or account credentials into issues. Removal denies current edition access; previously disclosed copies cannot be silently recalled.

The report queue contains bounded metadata. Edition inspection is a separate authorized request. UI state clears after an error. Keep the public web and provider gates closed until their separate acceptance passes. No moderation action was performed during candidate implementation.
