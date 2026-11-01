# Attributed proposal work observations

Date: November 1, 2026. Status: implementation candidate under R137; live delivery acceptance is separate.

Keep signed GitHub observations and authenticated model completion reports on the existing frozen proposal handoff. Public issue text may include a proposal locator, handoff marker and same-repository closing reference. These identifiers grant no access or execution authority. No callback secret belongs in an issue.

A signed PR event must bind the exact repository, installation, already confirmed issue and handoff. Existing indexed webhook receipts provide the bounded PR-to-handoff mapping. Store at most four PRs per handoff and twelve individual check facts per PR. Checks can arrive before the PR; bounded pending observations are attached only after the exact binding is established. Replays are idempotent. Older timestamps do not regress state; conflicting timestamps remain uncertain; a changed head discards old-head check facts.

The app shows these facts in a closed Work updates disclosure. An individual successful check does not mean all CI passed. A merge or assistant completion report does not establish user benefit. Explicit user judgments and measured outcome notes retain their own provenance through existing feedback/report APIs.

Repository permissions are unchanged. The existing App already subscribes to issues and pull requests. Check-run delivery was additionally enabled on November 1 after the owner's GitHub access confirmation. Actual receipt handling and independent end-to-end PR/check correlation still require production evidence; isolated signed/out-of-order fixtures establish implementation behavior only.
