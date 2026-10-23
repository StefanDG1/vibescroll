# Use the personal analysis runner

This restricted personal alpha analyzes permitted supplied text and prepared media through your own eligible ChatGPT plan. It uses `OfficialAssistantClient` with the isolated official Codex controller. No paid inference fallback is used. Source evidence, account eligibility and coding authorization remain separate checks.

## Prepare the computer

Use the project's pinned Node 24 runtime and supported Windows computer. Keep the existing Docker Desktop Linux engine available through its local named pipe. The personal runner accepts only `npipe:////./pipe/dockerdesktoplinuxengine` or `npipe:////./pipe/docker_engine`, including any `DOCKER_HOST` override. A remote daemon is refused. Do not restart, upgrade or reset Docker, delete its data, or stop existing user workers to make this check pass.

The protected controller needs the already prepared official-client image pinned by SHA-256 in `subscription-images.json`. See [the subscription trial guide](subscription-analysis-trials.md) for the bounded preparation context. Existing image presence and a saved connection are prerequisites, not proof of a working session. Do not replace a pinned image with a mutable tag or weaken isolation. Any missing runtime or image preparation needs separate review before downloading or building it.

Copy [the runner configuration](../../packages/runner/config.example.json) to an ignored private local file only if this computer does not already have the correct paired configuration. Set `server` to the matching HTTPS `*.convex.site` origin, `workspaceId` to the chosen workspace and `deviceName` to this computer's name. Keep `credentialVaultAdapter` as `windows-credential-manager`. Never put account tokens or API keys in this file.

The template alone is not a startable media configuration. Add the reviewed `mediaImage` SHA-256 digest and the absolute `localAsr.pythonPath` and `localAsr.modelDirectory` from the prepared runtime. Follow [the ASR setup/inspection guide](local-asr-setup.md), preserve the existing pinned image and verify local prerequisites before starting. The full companion check currently requires these settings even for text-only work. If reviewed runtime/image settings are unavailable, keep processing blocked; do not invent a digest, bypass the check or assume a complete portable bootstrap has shipped.

For an installed package, use its existing absolute `VIBESCROLL_COMPANION_CONFIG_ROOT` outside the installation tree. It selects controller metadata and prepared work files; it does not replace the explicit device configuration argument. A source checkout without this variable uses its legacy `private` directory. Preserve the existing configuration location, Windows credential target and protected official connection. Do not override `HOME` or `CODEX_HOME` on the host.

If pairing is needed, run this from the checkout or verified package root, with the real absolute configuration path:

```powershell
node packages/runner/pair.mjs "C:\absolute\private\config.json"
```

In the signed-in app, open Computers, paste the public request, compare the fingerprint and confirm. Reauthenticate if requested. The request expires ten minutes after browser submission. The device credential stays in Windows Credential Manager. The pairing CLI refuses a configuration that already has a credential target; do not delete that target or overwrite a working pairing to bypass the refusal. Verify that the paired device belongs to the same account and workspace as the source.

The operator must allow only the verified owner's WorkOS subject through `PERSONAL_ALPHA_SUBJECTS_JSON` in the matching backend. `DISABLE_PERSONAL_ANALYSIS=true` blocks this route. An email address, saved preference or staging subject cannot grant production eligibility. Keep customer access closed until the applicable provider requirements pass.

## Check prerequisites and start one companion

A metadata-only local prerequisite report is available with:

```powershell
node scripts/companion.mjs preflight "C:\absolute\private\config.json"
```

This report checks local configuration, Docker, pinned image presence, saved protected connection presence, disk and media prerequisites. It opens no account credentials and starts no worker. It deliberately returns `processingReady: "unverified"`. Its full companion checks include offline transcription and a media image, even for a proposed text-only test. A blocked media prerequisite is not proof that text analysis failed, and a passed report does not verify account access, pairing, model availability or a cited result.

Start the unified companion explicitly with:

```powershell
node scripts/companion.mjs run "C:\absolute\private\config.json"
```

The current candidate dispatches supported personal source, assistant intake, project evaluation and plan jobs through one coordinator and protected controller. Do not launch `personal-runner.mjs`, `assistant-runner.mjs` or a standalone controller alongside it. Those lower-level entry points remain for bounded developer diagnostics, not the normal user setup. This guide describes the candidate checkout. It does not establish that the serving production release has this coordinator or its new task contracts.

The companion owns the protected four-hour session and connects through `OfficialAssistantClient`. The controller exclusively locks its protected connection, uses network-isolated read-only task containers and a bounded proxy, then cleans up its own resources. An existing controller or user worker must not be killed and its uncertain lock must not be removed to force another session.

If the controller cannot reuse the protected connection, follow only its official device-code sign-in when it offers one. Keep the displayed user code private. A stale or revoked saved connection can require explicit reconnect; stop and review the reported failure rather than deleting protected state automatically. The controller's `own_account_connected` status confirms that controller connection only. The personal worker must then advertise its current account profile and models to the matching backend before browser approval becomes available. The legacy `chatgpt:local connect`, `chatgpt:local models` or `LocalChatGPT.status()` route is not readiness evidence for this controller.

Keep the computer awake and the worker in its foreground terminal. Stop only this worker with Ctrl+C. Its stop path closes its client and sends stop to its own controller. Do not enable startup or launch another inference worker for a one-source canary. The worker prints bounded completion/failure messages, not prompts or model output. It polls for approved work while running; keep the canary scope to one explicitly selected source and do not leave it unattended with unrelated queued approvals.

## Approve one supplied-text source

1. Sign in to the intended private library. Save one rights-cleared source without automatic cloud analysis. To retain typed GitHub provenance, save its repository URL, open the source and choose Supply permitted text instead. Paste the permitted excerpt and choose Save supplied evidence only. This is recovery supplied by you, not verified direct retrieval. A plain text source is also supported, although the Save form currently calls its source type Supplied transcript; label non-transcript material accurately in its title and text.
2. Open the saved source. Under Use your ChatGPT plan, choose your computer and an actually available account model. The computer must be paired to this account and workspace, have a personal-runner heartbeat within 60 seconds, and advertise its current profile binding and model list. A saved connection or ordinary companion heartbeat alone is insufficient.
3. Select a reasoning effort actually advertised for that model, review the own-plan consent and choose Analyze with my plan. Reauthenticate if requested. Approval binds the current source generation, device, account profile, chosen model and effort. A default effort cannot substitute for an unsupported account choice. An unclaimed approval expires after 15 minutes.
4. Review the actual completed summary, claims, citations and uncertainty. Supplied text uses no media preparation credits and establishes no audio, frame or direct-provider coverage. OpenAI plan limits still apply. Do not switch to cloud processing or an API key after a refusal or uncertain result.
5. Cancel from the source screen if needed. Started work may count against the plan. Check the actual source state and official plan usage before any retry. A completed source is engineering evidence for this one run, not a quality benchmark or customer outcome.

For a public README canary, retain the exact repository commit, applicable licence notice and permitted excerpt. After actual analysis, separately review publication rights, selected insights, permission expiry and the exact edition payload/hash. Source submission or own-plan consent does not approve public publication or reuse. Direct retrieval, a visible contributor globe, independent usefulness and customer permission cannot be inferred from this test.

## Media and remaining verification

The permitted-media route can transcribe locally and analyze sampled frames. It requires verified media capability and explicit maximum compute-credit approval before hosted isolated preparation. The ordered candidate extends the same source, preparation and personal-job systems to supplied image/video collections. Its actual model/modality and local ASR preflight must pass before dispatching paid preparation. Ordered retries currently prepare again; do not assume they reuse cached preparation. Use [the video guide](../PERSONAL-VIDEO-GUIDE.md) for the existing video workflow and [the ASR guide](local-asr-setup.md) for the pinned model check. Text-only approval does not authorize a video job. New ordered production acceptance remains pending.

The [owner testing guide](owner-testing-guide.md) records remaining production and video acceptance. Local prerequisites, unit tests, a standalone transcription sample and a successful protected connection are different observations. None replaces a fresh browser approval and actual current cited result.
