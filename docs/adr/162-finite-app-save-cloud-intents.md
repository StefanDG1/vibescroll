# ADR 162: finite Cloud intent before starting a source job

Date: October 26, 2026. Status: implementation candidate, disabled and unpublished.

## Decision

An authenticated private-library owner can explicitly save one Instagram or TikTok video for automatic Cloud analysis after reviewing new `app-save-cloud-v1` defaults. Existing grants gain no authority. The new optional grant value binds model, effort and finite result retention under the current private media policy. Separate saved-link enablement and verification flags default off. Preserve the existing requested-versus-attested model distinction.

Use the existing source record for a finite intent, with no new table, queue, worker, scheduler or index. Bind the exact source, actor, OAuth client, grant version, source revision/hash, media policy, defaults and expiry. The intent lasts at most24hours and never beyond source/result retention or the current grant. It creates no execution lease, analysis generation or credit reservation.

The existing `video_link_saved` notification wakes the native Work monitor. Its identity-only payload stays unchanged. The monitor reads `get_job_status` for that exact source. Only a current `saved_cloud_intent` permits the automatic branch. The host must complete actual package, image, acquisition-network and decoder-isolation preflight before consuming it. A source event or model-generated assertion cannot establish host admission.

Consume through the existing `request_analysis` tool with `mode=work_cloud` and `savedIntentId`. Reject caller overrides of model, effort, retention, generation, project, credit or funding. Reuse the existing Cloud request, hourly quota, job, claim, heartbeat, preparation, JPEG attachment and completion workflow. The server fixes own-subscription funding, zero API maximum and private-only output through the existing policy. The short job starts after preparation. Exact unclaimed acknowledgements reuse the existing generation and reservation; claimed, ready or unknown work creates no replacement.

Ordinary Save, shared capture, creator capture and MCP capture never stage this app intent. App authentication rejects MCP identities before capture. A reused save key must still match the requested video identity. Existing results, failed/unknown generations and other executors are preserved. Stale or expired intents require post review and cannot silently renew on re-save. Source deletion, retention invalidation, recovery and executor replacement clear the intent. Current grants, membership, source rights and retention are checked again when consuming it.

## Runtime evidence

The native Work task reports Python3.12.14, FFmpeg, FFprobe, Bubblewrap, unshare, prlimit and uv, with UID0 and zero effective/permitted/ambient capabilities. Its full Bubblewrap experiment failed at a forbidden netlink socket; a separate filesystem-only experiment failed at UID mapping. A read-only Landlock ABI query returned errno38. No source, package or model was downloaded, no restriction was bypassed and monitors stayed paused.

The separate `linux-decoder-socket-denial-v1` candidate passed real Linux syscall and exec-inheritance tests in CI40335580297 at source89ef2eb. It requires an unprivileged child, supplies only network denial, and is neither native-host admission nor integration into the current v2/v3 package. A later fix forwards its mandatory-test flag through the offline wrapper; actual Linux tests already ran in the earlier CI, but that flag had been filtered out.

[OpenAI's Work Cloud security documentation](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security) describes VM-backed hosted execution and distinct capability controls. It does not establish that this task can run the required inner decoder boundary. Do not enable automatic source processing from shell availability or a successful notification. Provider/privacy, retention and commercial gates remain.

## Acceptance and rollout

The backend candidate has focused tests for finite Save, one occurrence, no premature job, safe consumption/replay, changed source/grant/defaults/expiry, OAuth-client separation, app-only capture, key collisions, deletion and preserved unknown work. Wider checks and exact CI are recorded separately in implementation status. There is no production schema change or automatic-analysis claim from this ADR.

The reviewed-defaults editor, Save form and route setup now connect to this intent under the same off-by-default gate. Availability requires exactly one current reviewed connection plus its active saved-link monitor; app capture rechecks that monitor before saving. No monitor cannot silently queue a different route. Pending intent progress changes its lightweight revision without changing the heavy content revision. Next validate a supported actual media host and complete one funded native Save-to-retained-result canary. Preserve the EUR8 cap, all older holds, both TikToks, unknown source and original-image repair. A new controlled publication needs its own bounded reservation. The current serving picker and guide remain sourceff7d88f.
