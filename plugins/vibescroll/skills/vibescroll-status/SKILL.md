---
name: vibescroll-status
description: Check a saved source's analysis status, recover an exact current result or configure explicitly requested completion monitoring in supported hosts.
---

# Read status and recover carefully

1. Call `get_job_status` for the exact selected/saved source and profile. Preserve its generation, revision, grant version and processing stage.
2. If ready, fetch the result. If running/queued, explain current status without tight polling. Unknown/recovering execution or usage is not failure or refund.
3. An uncertain completion is recovered through its existing receipt/lease contract; do not create replacement processing or switch funding automatically.
4. Use `render_vibescroll_card` for a compact current status. Visible widget refresh and server event delivery are separate facts.
5. Only when the user explicitly requests monitoring, use the host's supported native Events/monitor setup with exact source/profile/grant filters. Let the host create its real callback/signing credentials. Never invent them.
6. Distinguish a subscription, signed callback, host wake and visible reply. Do not claim a notification is configured from an HTTP success alone or promise it on unsupported clients.

Return a concise actual status and the next useful supported action. Do not repeatedly narrate unchanged state or create recurring tasks merely because a link was saved.
