# Media decoder test prerequisites

The ordered decoder tests create and inspect actual synthetic image/video bytes. They need Pillow, FFmpeg and FFprobe. They do not establish isolation, provider access or production processing success.

CI targets the existing Ubuntu 24.04 x64 runner and its Python 3.12. Before the main offline check, it builds a minimal FFmpeg/FFprobe test toolchain and creates a virtual environment under `RUNNER_TEMP`. It installs the exact Pillow 11.3.0 wheel in [the lock](../../tests/requirements-media.lock). This retains the Pillow version in [the media runtime](../../infra/subscription-media.Dockerfile). Pip uses no index or dependency resolution, requires the wheel hash and does not permit a source build. The toolchain and venv precede system tools on the subsequent test PATH. Both are disposable; they do not modify global packages.

The wheel's SHA-256 and 6,645,236-byte size come from [Pillow's official PyPI metadata](https://pypi.org/pypi/pillow/11.3.0/json). The lock supports CPython 3.12 Linux x86_64 only. A different platform needs its own reviewed wheel/hash; do not remove hash verification or use a global Pillow installation to bypass a lock failure.

## Project-scoped FFmpeg build

[The preparation script](../../scripts/prepare-media-tests.sh) downloads only the [official FFmpeg 9.0.2 release](https://ffmpeg.org/download.html), requires the exact archive size/hash in [the source lock](../../tests/media-tools.lock.json), rejects redirects and unsafe archive paths/types, and builds into a fresh `RUNNER_TEMP` directory. During lock review, its detached signature passed verification against the official published signing fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8`. The SHA-256 is computed from those signature-verified bytes; it is not described as an upstream-published checksum.

The build uses the runner's existing compiler and Make. It disables network protocols, autodetected external libraries, assembly, documentation and debug support. Its limited formats cover synthetic color/MPEG-4 fixtures, ordered JPEG frames and PCM audio: file/pipe input, MOV/MP4/Matroska/image/WAV containers, MPEG-4/MJPEG/PCM/AAC codecs and the required scale/format/resample filters. This is a test-only toolchain, not a production codec-support or isolation claim. It does not change the production Dockerfile, install system packages or provide a fallback provider.

## When prerequisites fail

Run `python3.12 tests/check_media_prerequisites.py --tools-only` on the runner. It performs version checks against existing executables and installs nothing. After preparing the locked venv, run its Python with `tests/check_media_prerequisites.py` to verify all prerequisites.

If the source download, hash, compiler/build, wheel installation or either executable check fails, CI fails before decoder tests. The current [GitHub runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) does not promise FFmpeg availability, so CI builds the reviewed project-scoped version. The job does not run `apt`, change a system installation or download an unreviewed binary build. Keep any prerequisite failure visible until it is resolved.

The standalone ordered-video test retains its local missing-tool skip message. CI's prerequisite step prevents that skip from silently counting as complete CI decoder coverage. Direct local runs must report any skip explicitly; use the prerequisite command first when claiming complete decoder coverage.

Validate the preflight behavior without downloads using `python tests/media_prerequisites_test.py`. This unit fixture does not verify an actual Linux toolchain, wheel installation or hosted CI pass.

## Earlier local Linux smoke evidence, October 23

The exact preparation script built FFmpeg and FFprobe 9.0.2 in a disposable project container using the existing pinned Python 3.12 Debian base. The two-job build took about 52 seconds. A fresh Python 3.12.15 venv installed the hashlocked Pillow 11.3.0 wheel, then passed the strict prerequisite check, three prerequisite unit tests and all six ordered decoder tests with no skips. The mixed image/video case generated an actual synthetic MPEG-4 fixture and inspected its decoded JPEG frames. The source build emitted upstream compiler warnings, retained in the private build log; it is not described as warning-free.

Compiler packages were installed only inside that disposable validation image. No host packages or production runtime files changed. This verifies the source-build flags and decoder dependencies on local Linux. Hosted Ubuntu 24.04 CI, full product checks, actual media jobs and production isolation remain separate observations.

## Eight-test follow-up, October 23

After the decoder suite added AAC audio normalization and container MIME checks, the updated preparation script rebuilt the same locked FFmpeg 9.0.2 source with its AAC encoder/decoder and sine filter enabled. A fresh locked Pillow 11.3.0 venv passed the strict prerequisite check, three prerequisite unit tests and all eight ordered decoder tests with zero skips. The audio case generated an actual synthetic AAC track and decoded it into bounded PCM bytes with a checked hash. The MIME case checked container headers so QuickTime and generic Matroska are not labelled MP4 or WebM.

This follow-up used the same disposable local Linux compiler container baseline and project-scoped installation, including pip's no-cache flag. Earlier six-test evidence and compiler warnings remain in the private receipt history. The validation image tag was removed after the run. These are local dependency and decoder checks; hosted Ubuntu CI and actual processing jobs remain separate acceptance steps.
