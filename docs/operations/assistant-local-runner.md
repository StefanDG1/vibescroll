# Run automatic assistant analysis on your computer

Mode: how-to. October 20, 2026 implementation. The personal-account eligibility gate remains in effect; consult [implementation status](../implementation-status.md) for exact release and live acceptance.

## Configure once

1. Pair your own computer using the existing [device setup](personal-analysis-runner.md). Keep the device credential in Windows Credential Manager.
2. Prepare the existing pinned local Docker images and your saved official Codex connection described in [ADR 107](../adr/107-persistent-local-chatgpt-connection.md). The older standalone SIWC text adapter is a separate connection. Docker isolation and a working offline Whisper installation are required.
3. In an ignored private copy of the paired runner configuration, keep the existing `server`, `workspaceId`, `credentialVaultAdapter` and `credentialTarget`. Add `mediaImage` with the exact local decoder image digest from your private image manifest, and retain `localAsr.pythonPath` and `localAsr.modelDirectory`. Use no provider token in this configuration.
4. From the repository root run `pnpm runner:assistant C:/absolute/private/config.json`. The command restores the saved official-client login into an isolated worker, announces the computer and waits for approved incoming work. If official sign-in or consent is needed, complete it locally; the app cannot manufacture it.
5. Open VibeScroll Connections, edit the assistant's preferences, choose the library scope and actions, and enable **Extract and organize automatically on my computer**. Select the announced paired computer, review the scope and save after a recent app sign-in. Current and future explicitly submitted links use these preferences. Existing grants retain their old behavior until reviewed. If your host still shows required per-link confirmation fields or describes analysis as review-only, refresh its VibeScroll tool definitions through its supported controls. Host-controlled OAuth consent and tool approval settings remain separate.

## Send links and choose next steps

Sending a supported YouTube, Instagram, TikTok or Vimeo link to the selected VibeScroll assistant saves it and queues local extraction and organization. No repeated rights question is needed after setup. Submit content you are permitted to process; private, blocked or unsupported sources can still require a permitted upload. A repeated save reuses the source rather than starting duplicate work.

- Say **save only** to skip analysis.
- Include an approved project name to request its private evaluation, or explicitly ask to **find the best project matches** among the selected current projects. Project context changes require review. The default does not start project work.
- If the computer is offline, keep waiting or explicitly choose the offered credit maximum. The quote includes current unexpired available/total VibeScroll credits and the source generation. A competing local start invalidates the offer. The app never changes funding route after work starts.
- Open the source or ask for its status to check completion, actual settled credit usage and current remaining balance. Reserved or uncertain usage is labelled pending, not final. ChatGPT subscription allowance is separate from VibeScroll credits.
- After extraction, the source receipt and app notification offer project evaluation. Persistent MCP Events remain disabled; an unsolicited completion reply inside a finished ChatGPT/Codex conversation is not promised.

## Operation and recovery

The local route uses isolated local acquisition/decoding, offline transcription and the user's own official-client inference. Derived evidence is saved to the existing private library storage. It does not reserve VibeScroll processing credits or run a separate paid API call. Each task uses a finite run bounded by the isolated worker's remaining lifetime; queued offline intent has no running inference session to prolong.

The controller reuses the existing four-hour worker deadline and saved-login rotation. It waits longer when idle, up to five minutes, and claims at most one source at a time. Server lookups use indexed device/state queues; there is no periodic Convex job checking offline computers or scanning the whole library. New work may therefore wait up to five minutes for an idle computer's next check.

Stop the command to pause processing. Turn off automatic analysis or revoke the connection in Connections to prevent later claims. Source deletion, rights changes, lost membership, changed device/account and replaced grants fence subsequent inputs and results. If a run fails or its usage is uncertain, review its source and official ChatGPT usage before explicitly requesting another run. Never solve a failure by switching models, accounts or funding automatically.

The normal cloud credit route retains its existing media/provider verification and atomic cost ceilings. Credits used for local project evaluation remain zero; choosing cloud extraction does not fund later project work, which waits for the local computer. Coding and any publication require their existing separate approvals.
