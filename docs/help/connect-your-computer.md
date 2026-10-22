# Connect your computer for own-plan work

Use the website to save, review and approve work from your phone or computer. The own-plan route runs approved tasks on your awake paired Windows computer through your own eligible official account. It does not lend you another person's subscription or provide computer-free inference.

## Before you start

Check **Continue setup** for account eligibility and available processing routes. A preference, paired computer or saved login cannot enable a route that the service has not authorized. Commercial provider access remains separately gated. You can keep saving sources while processing is unavailable.

You need the supported Node 24 runtime, a local Docker Desktop Linux engine, the pinned official-client image and sufficient disk space. Video also needs the supported media tools, isolated preparation image and pinned offline transcription environment/model. Use the versions and instructions supplied with the reviewed runtime; do not replace image digests with mutable tags, install unrelated packages or turn off isolation to clear an error.

The website needs no Windows signing certificate. A maintained installer/update needs a genuinely trusted signed release. If no such download is available, [Open source](/open-source) explains the developer source option. A source checkout is a technical setup path, not a released signed installer. Do not bypass Windows warnings or package signature checks.

Own-plan inference consumes your provider allowance. It does not make preparation, storage, platform operation or electricity free. Read each task's route, quote and maximum. A failed local task never silently switches to paid inference.

## Prepare your configuration

Use the configuration for the signed-in account and workspace where you will save the source. Keep it in a private local file outside an installed application's version directory. The configuration contains the matching HTTPS backend origin, workspace, computer name and protected credential-store adapter. Use the setup configuration offered by that workspace; do not copy somebody else's paired file or guess a backend address.

In **Continue setup**, select the paired-computer route and choose **Download new computer configuration**. Save it with a new filename, choose your computer name locally, and add the required pinned media/transcription settings from the reviewed runtime setup. The download has no login token, device credential or existing credential target. It installs nothing and starts no work. Do not overwrite a paired configuration.

If that button is unavailable, the deployment could not verify matching setup origins. Keep the source saved and report the app version and safe error to the deployment operator. The operator must verify the backend's matching built-in Convex cloud/site origins; a browser-supplied override is not a repair. Reload setup after the deployment is repaired. Do not paste deployment credentials into this page.

For a reviewed source checkout, the template is `packages/runner/config.example.json`. Use the matching deployment's setup values. Leave `credentialTarget` empty for first pairing and keep `credentialVaultAdapter` set to `windows-credential-manager`. No ChatGPT password, OAuth token or API key belongs in this file. If setup values or the required runtime are unavailable, stop here and use the safe error/version details to request help.

Run the following commands from the verified package or checkout root. Replace `ABSOLUTE_CONFIG_PATH` locally with the quoted absolute path to your private configuration. Never paste that path or configuration into Help, a public issue or the prerequisite-report field. Preserve an existing installation's `VIBESCROLL_COMPANION_CONFIG_ROOT`; do not change host `HOME` or `CODEX_HOME`.

## Pair your computer

1. On the Windows computer, run:

   ```powershell
   node packages/runner/pair.mjs "ABSOLUTE_CONFIG_PATH"
   ```

2. In the same signed-in workspace, open **Account → Computers**. Paste only the terminal's **Public pairing request** and choose **Review device request**.
3. Compare the full fingerprint with the terminal on the computer you control. Choose **Confirm matching computer** only when it matches. Complete normal sign-in/MFA if fresh authentication is requested.
4. Return to Home and choose **Check current setup**. Pairing establishes a device relationship, not account access or permission to analyze a source.

The request expires ten minutes after browser submission. The credential stays in Windows Credential Manager. An already paired configuration refuses another pairing command. Do not delete a credential, overwrite the configuration or remove an uncertain lock to force setup; inspect the existing pairing or explicitly revoke the intended device first.

## Check prerequisites

After pairing, run:

```powershell
node scripts/companion.mjs preflight "ABSOLUTE_CONFIG_PATH"
```

Read each blocked or unknown check and its repair. The check starts no worker and performs no provider sign-in. If only the saved official account connection is missing, a **ready to connect** result allows the next connection step. It is not a passed full prerequisite report and does not mean processing is ready. Missing isolation, tools, image, disk or paired configuration must be repaired first.

If you want to record the result in **Continue setup**, paste only the metadata-only prerequisite JSON into **User-provided local prerequisite report**. Do not paste the configuration or full terminal log. The browser records your report for 24 hours; it has not independently inspected the computer. Even a full pass leaves actual account/model access and a cited sample unverified.

## Connect and start

Run one companion:

```powershell
node scripts/companion.mjs run "ABSOLUTE_CONFIG_PATH"
```

This entry point owns the protected official controller and dispatches supported approved tasks. Do not separately launch another analysis worker or `start-subscription-session` controller alongside it. A conflicting session must be reconciled, not killed to force access.

If official sign-in is needed, follow the device-code consent shown by that controller. Enter your own account's consent yourself. Keep codes, login screens and credentials out of recordings, logs and support reports. A stale or revoked saved connection may require supported reconnect; do not substitute a legacy connection command or another person's account.

Keep the computer awake. Return to the app and choose **Check current setup**. Paired, connected and online are different observations. A model listed by the account is a choice to try, not a guarantee that a request will be accepted. Quota, supported effort, task modality, current account profile and source permission are checked again for the actual task.

Once the account is connected, rerun the prerequisite command and record its full report. The first connection report does not silently turn into a full pass. A ready result with inspectable citations is the final first-use observation, not a green connection badge.

## Approve one source

Start with one short source you are permitted to process. Choose **Save**, review its input and permission, and save it once. Open the source and choose an available computer, model and reasoning effort where offered. Review the exact own-plan approval and any separate preparation maximum, then approve once. Reauthenticate when asked.

For video, inspect the actual preparation route and cost before submitting. Supported preparation turns permitted media into bounded transcript and sampled-image evidence; it does not send raw video to a model that cannot accept it. Missing media prerequisites remain visible. For supplied text, there is no audio/frame coverage or implied direct provider retrieval.

Inspect the completed result's original evidence, claims, interpretations, omissions and warnings. If it fails or completion is uncertain, check the existing status before retrying. A failed or canceled turn may still consume provider allowance. [Inspect your first result](/help/first-useful-insight) or [repair processing](/help/processing-and-recovery).

Project evaluation and editable plans keep their own current source/repository context, chosen route and approval. Connecting a computer or finishing source analysis grants no coding, spending or public publishing permission. [Review a project idea](/help/evaluate-an-idea-for-a-project).

## Pause and startup

To request this companion's normal cleanup, run:

```powershell
node scripts/companion.mjs pause "ABSOLUTE_CONFIG_PATH"
```

Inspect its local state with:

```powershell
node scripts/companion.mjs status "ABSOLUTE_CONFIG_PATH"
```

Resume requires explicit local consent and then a deliberate start:

```powershell
node scripts/companion.mjs resume "ABSOLUTE_CONFIG_PATH" --allow-approved-work
node scripts/companion.mjs run "ABSOLUTE_CONFIG_PATH"
```

Optional Windows sign-in startup needs its separate consent:

```powershell
node scripts/companion.mjs startup-enable "ABSOLUTE_CONFIG_PATH" --start-at-sign-in
```

Turn it off with:

```powershell
node scripts/companion.mjs startup-disable "ABSOLUTE_CONFIG_PATH"
```

These commands affect this managed companion, not unrelated workers. Startup does not grant new task approval or wake sleeping hardware. The browser cannot read back local pause/startup state merely from displaying instructions. Cancellation, pausing, unpairing, local account logout and server permission revocation have different effects; choose the intended action and verify its result.

## You have finished when

You can explain which account and computer will run an approved task, its funding limits, and how to stop it. For a processing acceptance result, also retain the actual cited source output. If setup is blocked, keep the source saved and the safe error details; do not bypass isolation, credentials or provider restrictions.
