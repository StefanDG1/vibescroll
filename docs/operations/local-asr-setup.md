# Prepare and inspect the local ASR model

This guide covers the immutable English transcription model and its metadata check. It does not install Python, prepare a complete dependency environment, connect an account or run transcription. The supported compatibility baseline is CPython 3.13 and faster-whisper 1.2.1. The complete transitive wheel and binary lock remains pending; matching these versions alone does not establish binary trust or reproducible installation.

Use the reviewed source checkout or runtime package. Keep the existing paired configuration and credentials unchanged. Model files belong in a private directory outside an installed application's immutable version directory. Do not change `HOME`, `CODEX_HOME`, Docker, WSL or system Python to clear a failed check.

Each transcription job repeats the shared verifier before loading the model. It checks the committed lock rather than trusting a locally authored manifest. A changed revision, replacement hash/size, unsafe ancestor, extra runtime file or unsupported runtime blocks that job. The helper loads from its explicit packaged path under Python isolated mode; a file in the current working directory cannot replace it.

## Inspect an existing model

From the package root, replace the placeholders locally with absolute paths:

```powershell
& "ABSOLUTE_PYTHON_PATH" -I scripts/setup-local-asr.py --inspect "ABSOLUTE_MODEL_DIRECTORY"
```

The check verifies all four runtime model files against [the reviewed lock](../../packages/media/asr-model.lock.json), including exact sizes and SHA-256 hashes. It checks the exact existing model manifest, CPython minor line, faster-whisper version and importability of its local runtime. It does not construct a model, load weights for inference, inspect credentials or contact a provider. The report contains no configured paths.

The lock identifies `Systran/faster-whisper-small.en` at immutable revision `d1d751a5f8271d482d14ca55d9e2deeebbae577f`. Hashes and sizes were checked against the existing reviewed local copy of that revision. They are not described as upstream-signed checksums or a new download acceptance result.

Known bounded Hugging Face `.cache` bookkeeping may remain. It must consist only of the approved ordinary metadata paths, with no symlinks or junctions. Its contents are not read or used as model authority. Unexpected runtime files, changed manifests, changed weights and unsafe ancestor paths fail inspection. The check never deletes an existing model or its cache.

## Prepare a new model directory

Only use this step when the free public model download and destination have been approved. It downloads approximately 486 MB. The parent directory must already exist; choose a new model-directory name.

```powershell
& "ABSOLUTE_PYTHON_PATH" -I scripts/setup-local-asr.py "ABSOLUTE_NEW_MODEL_DIRECTORY"
```

The script requests only the locked revision's four files. It bounds each download, verifies hashes and sizes in a new sibling staging directory, writes the matching manifest and verifies the complete staged model before Windows activates it. It never selects the repository's latest revision. Network failure, a changed file or a destination created during setup stops activation. Only the script's own staging directory is eligible for cleanup.

A valid existing destination is verified and left unchanged. An unknown or partial destination is refused. Do not delete or overwrite it to force setup. Preserve a working old model and choose a new directory for a separately reviewed replacement. This download path has offline boundary tests; a fresh live download was not performed for this change.

## Check the companion

Keep `localAsr.pythonPath` and `localAsr.modelDirectory` in your private configuration. Run the normal companion prerequisite check described in [Connect your computer](../help/connect-your-computer.md).

The companion now requires successful ASR runtime/model inspection rather than path existence alone. A connection-only result still differs from the full prerequisite result, and `processingReady` remains `unverified`. A real source, account/model access, supported isolation, current permissions and inspected citations remain separate acceptance steps. The October 22 synthetic speech result remains historical evidence; this metadata check is not a new speech or provider result.
