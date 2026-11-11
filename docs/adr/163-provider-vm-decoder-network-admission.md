# ADR 163: admit the restricted provider VM separately from the decoder network filter

Date: October26, 2026. Status: separate implementation candidate; no media admission or release.

## Observations

The native Work task is a provider Cloud execution path. Its metadata reports UID/EUID0, zero effective/permitted/ambient/bounding capabilities, `NoNewPrivs=1`, seccomp mode2 and one existing filter. The inheritable capability mask still needs actual verification. The earlier nested Bubblewrap and Landlock attempts failed. V1's separate decoder launcher rejects any UID0 before testing its own network denial.

[OpenAI's Work Cloud documentation](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security) describes account-user-scoped VM-backed sandboxes and possible environment/state reuse. [Its sandbox guide](https://learn.chatgpt.com/docs/sandboxing?surface=web) distinguishes managed Work Cloud policies from local Codex/Bubblewrap controls. Neither a fresh container nor a customer-managed inner namespace is promised. A failed nested namespace does not establish that the provider VM lacks its outer isolation.

The [Linux no-new-privileges contract](https://docs.kernel.org/userspace-api/no_new_privs.html) describes permanent inherited restrictions. [Seccomp documentation](https://docs.kernel.org/userspace-api/seccomp_filter.html) describes filter inheritance across execution and explicitly says that syscall filtering alone is not a complete sandbox.

## Decision

Keep V1's nonroot admission unchanged. Add separately versioned `linux-provider-vm-decoder-socket-denial-v2` for this already restricted VM configuration. Root is accepted only with UID and EUID both0, all five capability masks already zero, no-new-privileges already enabled, at least one existing provider filter, Linux x86-64 and a fresh single-threaded child. Missing or changed state refuses before a decoder. It neither grants privileges nor alters an existing provider control.

Share the reviewed architecture-aware filter and descriptor/environment handling with V1. Close inherited descriptors, reject socket standard I/O, add irreversible socket/IPC/io_uring/descriptor-injection denial and verify real raw socket syscalls return `EPERM` before execution. Test an actual exec descendant. A CLI argument or model statement is not network-denial evidence.

Establish the actual provider VM boundary separately. This adapter provides no filesystem boundary, provider attestation, source-network permission, resource limit or retention proof. Do not put application credentials or lease secrets in decoder-visible files or environment. Do not infer physical provider-history/cache deletion from removing job files. Existing process/file/time bounds and all app/provider/privacy gates remain. No local unrestricted execution, host mounts, network escalation or paid fallback is introduced.

The current v2/v3 Cloud package and its policy hashes are unchanged. This standalone candidate cannot authorize a source or silently replace an accepted toolchain. Complete exact CI and a separately bounded synthetic native test before deciding whether to integrate it. Acquisition-network policy, verified packages/ASR or narrower caption-only scope, lease control and a real automatic result remain separate acceptance.

## Validation

Fixtures cover exact root state, every capability including inheritable/bounding, missing controls/state, mixed identities, existing threads, preserved V1 refusals and no install/exec on rejection. Actual Linux tests must verify socket denial and inheritance; Windows reports its explicit skip. Native testing must use only synthetic inputs, preserve monitors/permissions and stop on any failed control. No source/job or enabled-analysis claim follows from this decision.

## Actual synthetic validation, October26

Source `dfb4acac519b09898bc465791a51fabe77b53866` passed exact CI40351522420. Its eight provider-VM tests ran without a skip, including real socket/exec denial and FFmpeg/FFprobe decoding. The same exact three pinned source/test files then passed all eight tests in the actual native Work task, again without skips. That task reported inheritable and bounding capabilities0, NNP1 and its existing provider filter. Owned synthetic directories were reported removed. One ordinary chat reload displayed the persisted completion; no test was resubmitted.

This closes the tested decoder-network assumption, not source or whole-host admission. No real source, app call, model, job or monitor change occurred. A separate pinned caption-package setup/synthetic preparation attempt is pending under its own budget reservation. [Sanitized receipt](../operations/evidence/launch-20261026-provider-vm-decoder.json).
