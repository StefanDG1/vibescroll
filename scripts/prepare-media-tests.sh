#!/usr/bin/env bash
# CI test tools only. No system packages, provider calls or production runtime changes.
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Media CI toolchain requires Linux x86_64; no platform fallback is authorized.' >&2
  exit 1
fi
if [[ -z "${RUNNER_TEMP:-}" || "$RUNNER_TEMP" != /* || ! -d "$RUNNER_TEMP" ]]; then
  echo 'Set RUNNER_TEMP to an existing absolute project-scoped temporary directory.' >&2
  exit 1
fi
for tool in python3.12 cc make; do
  command -v "$tool" >/dev/null || { echo "Missing build prerequisite: $tool (no system installation performed)." >&2; exit 1; }
done
work_root="$(mktemp -d "$RUNNER_TEMP/vibescroll-media.XXXXXXXX")"
prefix="$work_root/toolchain"

python3.12 - "$repository_root/tests/media-tools.lock.json" "$work_root" <<'PY'
import hashlib
import json
from pathlib import Path
import sys
import tarfile
import urllib.request

lock = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
root = Path(sys.argv[2]).resolve(strict=True)
if lock["url"] != "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz" or lock["version"] != "9.0.2":
    raise RuntimeError("Unreviewed media source URL/version")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError("Unexpected media source redirect")

with urllib.request.build_opener(NoRedirect).open(lock["url"], timeout=60) as response:
    payload = response.read(lock["bytes"] + 1)
if len(payload) != lock["bytes"] or hashlib.sha256(payload).hexdigest() != lock["sha256"]:
    raise RuntimeError("Media source size/hash mismatch; no extraction/build performed")
archive = root / "source.tar.xz"
archive.write_bytes(payload)
with tarfile.open(archive, "r:xz") as source:
    members = source.getmembers()
    for member in members:
        parts = Path(member.name).parts
        if not parts or parts[0] != "ffmpeg-9.0.2" or ".." in parts or member.name.startswith("/") or not (member.isdir() or member.isfile()):
            raise RuntimeError("Unexpected path/type in reviewed media archive")
    source.extractall(root, members=members, filter="data")
print(json.dumps({"source": lock["url"], "bytes": len(payload), "sha256": lock["sha256"], "buildRoot": str(root)}))
PY

cd "$work_root/ffmpeg-9.0.2"
./configure --prefix="$prefix" \
  --disable-everything --disable-autodetect --disable-network --disable-x86asm \
  --disable-doc --disable-debug --disable-shared --enable-static \
  --disable-ffplay --enable-ffmpeg --enable-ffprobe \
  --enable-avcodec --enable-avformat --enable-avdevice --enable-avfilter \
  --enable-swscale --enable-swresample \
  --enable-protocol=file,pipe --enable-indev=lavfi \
  --enable-filter=color,sine,scale,format,aresample,anull,null,buffer,buffersink,abuffer,abuffersink \
  --enable-encoder=mpeg4,mjpeg,pcm_s16le,aac \
  --enable-decoder=mpeg4,mjpeg,pcm_s16le,aac,rawvideo,wrapped_avframe \
  --enable-demuxer=mov,matroska,image2,wav \
  --enable-muxer=mp4,mov,image2,wav \
  --enable-parser=mpeg4video,mjpeg
make -j2
make install
"$prefix/bin/ffmpeg" -version
"$prefix/bin/ffprobe" -version
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$prefix/bin" >> "$GITHUB_PATH"
fi
printf 'Project-scoped decoder tools: %s/bin\n' "$prefix"
