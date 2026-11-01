---
name: vibescroll-status
description: Check a saved source's analysis status, recover an exact current result or configure explicitly requested completion monitoring in supported hosts.
---

# Read status and recover carefully

1. Call `get_job_status` for the exact saved source and profile, or `video_analysis_status` for prepared work. Preserve returned source, run, version and authority references.
2. If ready, fetch the result with `format=structured_v1` when supported. Reuse it without another analysis charge. If waiting, queued or running, explain the observed stage without tight polling. A hold or unknown charge is not a final settlement.
3. Follow the returned `next_action` and safe error `retryability`. `reconcile_first` means read the original operation and preserve its key, lease and unknown exposure. `retry_existing` retains that operation. Stale bindings require a fresh read; none authorize a replacement or funding switch.
4. Use `render_vibescroll_card` for a compact current status. Visible widget refresh and server event delivery are separate facts.
5. Only when the user explicitly requests monitoring, use the host's supported native Events/monitor setup with exact source/profile/grant filters. Let the host create its real callback/signing credentials. Never invent them.
6. Distinguish OAuth, a subscription, signed callback, host wake and visible reply. A paused or unsupported worker is not a login failure. Do not claim a notification from HTTP success alone or promise replies in unrelated chats.

Return a concise actual status and the next useful supported action. Do not repeatedly narrate unchanged state or create recurring tasks merely because a link was saved.
