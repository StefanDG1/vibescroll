"""Decode bounded ordered assets only inside the existing network-disabled media VM.

The manifest records decoded bytes and sampled representations. It does not claim
that a model inspected an image, transcribed speech, or acquired provider rights.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import warnings

from PIL import Image, ImageOps

MAX_BYTES = 250_000_000
MAX_DURATION_MS = 600_000
MAX_PIXELS = 4096 * 4096
MAX_REPRESENTATIONS = 48
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def run(args, root, timeout=30):
    result = subprocess.run(args, cwd=root, check=True, capture_output=True,
                            timeout=timeout, stdin=subprocess.DEVNULL)
    if len(result.stdout) > 100_000:
        raise ValueError("PROBE_TOO_LARGE")
    return result.stdout


def regular(path, maximum):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise ValueError("ASSET_FILE_INVALID")
    return path.stat().st_size


def fresh_output(root, filename):
    target = root / filename
    if target.exists() or target.is_symlink():
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    return target


def video_mime(source):
    # FFprobe groups MOV with MP4 and Matroska with WebM. Those groups are not
    # interchangeable MIME identities; inspect the bounded actual header too.
    with source.open("rb") as raw:
        header = raw.read(4096)
    if len(header) >= 16 and header[4:8] == b"ftyp":
        size = int.from_bytes(header[:4], "big")
        if not 16 <= size <= len(header) or size % 4:
            raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
        brands = [header[8:12]] + [header[i:i + 4] for i in range(16, size, 4)]
        if header[8:12] == b"qt  " or not any(brand in {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"dash"} for brand in brands):
            raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
        return "video/mp4"
    def vint(position, keep_marker=False):
        if position >= len(header) or not header[position]:
            raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
        first = header[position]
        length = next(i for i in range(1, 9) if first & (1 << (8 - i)))
        if position + length > len(header):
            raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
        value = int.from_bytes(header[position:position + length], "big")
        return (value if keep_marker else value & ((1 << (7 * length)) - 1)), position + length
    if header[:4] == b"\x1a\x45\xdf\xa3":
        size, position = vint(4)
        end = position + size
        if end > len(header):
            raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
        while position < end:
            key, position = vint(position, True)
            size, position = vint(position)
            if position + size > end:
                raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
            if key == 0x4282:
                if header[position:position + size] != b"webm":
                    raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")
                return "video/webm"
            position += size
    raise ValueError("VIDEO_CONTAINER_UNSUPPORTED")


def image_asset(source, root, index):
    with Image.open(source) as probe:
        if probe.format not in {"JPEG", "PNG", "WEBP"} or getattr(probe, "n_frames", 1) != 1:
            raise ValueError("IMAGE_FORMAT_UNSUPPORTED")
        if not 0 < probe.width <= 4096 or not 0 < probe.height <= 4096:
            raise ValueError("IMAGE_DIMENSIONS_EXCEEDED")
        mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[probe.format]
        width, height = probe.size
        probe.verify()
    with Image.open(source) as image:
        image.load()
        # EXIF orientation is applied before stripping all metadata. Coordinates
        # in the normalized representation refer to this oriented full image.
        image = ImageOps.exif_transpose(image)
        width, height = image.size
        image.thumbnail((960, 960))
        if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        filename = f"asset-{index:03}-image.jpg"
        image.save(fresh_output(root, filename), "JPEG", quality=80)
        size = regular(root / filename, 1_000_000)
        representation = {"file": filename, "kind": "image", "bytes": size,
                          "width": image.width, "height": image.height,
                          "sha256": digest(root / filename)}
    return {"kind": "image", "mime": mime, "width": width, "height": height}, [representation], None


def video_asset(source, root, index, frame_limit, remaining_ms):
    mime = video_mime(source)
    probe = json.loads(run(["ffprobe", "-v", "error", "-protocol_whitelist", "file",
                            "-show_streams", "-show_format", "-of", "json", str(source)], root, 15))
    streams = probe.get("streams", [])
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    formats = set(probe.get("format", {}).get("format_name", "").split(","))
    if len(streams) > 4 or len(video) != 1 or len(audio) > 1 or not formats.intersection({"mov", "mp4", "webm", "matroska"}):
        raise ValueError("VIDEO_FORMAT_UNSUPPORTED")
    duration = float(probe["format"].get("duration", 0))
    duration_ms = math.ceil(duration * 1000)
    width, height = video[0].get("width", 0), video[0].get("height", 0)
    if not math.isfinite(duration) or not 0 < duration_ms <= remaining_ms or not 0 < width <= 4096 or not 0 < height <= 4096:
        raise ValueError("VIDEO_LIMIT_EXCEEDED")
    representations = []
    for position in range(frame_limit):
        timestamp = min(duration_ms - 1, math.floor(duration_ms * position / frame_limit))
        filename = f"asset-{index:03}-frame-{position:03}.jpg"
        fresh_output(root, filename)
        run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-protocol_whitelist", "file",
             "-ss", str(timestamp / 1000), "-i", str(source), "-frames:v", "1", "-vf",
             "scale=960:960:force_original_aspect_ratio=decrease,format=yuvj420p", "-threads", "2",
             "-q:v", "4", str(root / filename)], root, 15)
        if not (root / filename).is_file():
            continue
        size = regular(root / filename, 1_000_000)
        with Image.open(root / filename) as image:
            frame_width, frame_height = image.size
        representations.append({"file": filename, "kind": "video_frame", "timestampMs": timestamp,
                                "bytes": size, "width": frame_width, "height": frame_height,
                                "sha256": digest(root / filename)})
    if not representations:
        raise ValueError("VIDEO_FRAMES_UNAVAILABLE")
    normalized_audio = None
    if audio:
        filename = f"asset-{index:03}-audio.wav"
        fresh_output(root, filename)
        run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "2", "-protocol_whitelist", "file",
             "-i", str(source), "-vn", "-t", str(duration), "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", str(root / filename)], root, 120)
        size = regular(root / filename, 19_500_000)
        normalized_audio = {"file": filename, "bytes": size, "sha256": digest(root / filename)}
    return {"kind": "video", "mime": mime,
            "width": width, "height": height, "durationMs": duration_ms}, representations, normalized_audio


def decode_ordered(directory):
    root = Path(directory).resolve(strict=True)
    raw = root / "ordered-input.json"
    regular(raw, 20_000)
    request = json.loads(raw.read_text(encoding="utf-8"))
    if set(request) != {"schemaVersion", "assets"} or request["schemaVersion"] != "ordered-input-v1" or not isinstance(request["assets"], list) or not 1 <= len(request["assets"]) <= 35:
        raise ValueError("ORDERED_INPUT_INVALID")
    assets, seen, previous, total_bytes = [], set(), -1, 0
    # Validate all path/count/aggregate bounds before any decoder runs.
    for item in request["assets"]:
        if not isinstance(item, dict) or set(item) != {"id", "index", "kind", "file"} or not isinstance(item["id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", item["id"]) or item["id"] in seen:
            raise ValueError("ORDERED_IDENTITY_INVALID")
        index = item["index"]
        if type(index) is not int or not previous < index <= 34 or item["kind"] not in {"image", "video"} or item["file"] != f"input-{index:03}":
            raise ValueError("ORDERED_PATH_OR_INDEX_INVALID")
        total_bytes += regular(root / item["file"], MAX_BYTES)
        if total_bytes > MAX_BYTES:
            raise ValueError("ORDERED_BYTES_EXCEEDED")
        seen.add(item["id"])
        previous = index
    frame_count = sum(item["kind"] == "image" for item in request["assets"])
    videos_left = sum(item["kind"] == "video" for item in request["assets"])
    total_ms = representation_bytes = audio_bytes = 0
    omitted = []
    for item in request["assets"]:
        source = root / item["file"]
        try:
            if item["kind"] == "image":
                metadata, representations, audio = image_asset(source, root, item["index"])
            else:
                limit = min(4, max(1, (MAX_REPRESENTATIONS - frame_count) // videos_left))
                metadata, representations, audio = video_asset(source, root, item["index"], limit, MAX_DURATION_MS - total_ms)
                frame_count += len(representations)
                videos_left -= 1
            total_ms += metadata.get("durationMs", 0)
            representation_bytes += sum(rep["bytes"] for rep in representations)
            audio_bytes += audio["bytes"] if audio else 0
            if representation_bytes > 12_000_000 or audio_bytes > 19_500_000:
                raise ValueError("ORDERED_OUTPUT_BYTES_EXCEEDED")
            assets.append({"id": item["id"], "index": item["index"], "bytes": source.stat().st_size,
                           "contentHash": digest(source), **metadata, "representations": representations,
                           "audio": audio})
        except (ValueError, OSError, subprocess.SubprocessError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
            if str(error) == "ORDERED_OUTPUT_BYTES_EXCEEDED":
                raise
            omitted.append({"id": item["id"], "index": item["index"], "reason": "decode_unavailable"})
    if not assets:
        raise ValueError("ORDERED_MEDIA_UNAVAILABLE")
    output = {"schemaVersion": "ordered-decoder-v1", "assets": assets, "omitted": omitted,
              "inputBytes": total_bytes, "videoDurationMs": total_ms,
              "representationBytes": representation_bytes, "audioBytes": audio_bytes}
    fresh_output(root, "ordered-manifest.json").write_text(json.dumps(output), encoding="utf-8")
    return output


if __name__ == "__main__":
    if os.name != "posix":
        raise RuntimeError("ORDERED_DECODER_REQUIRES_ISOLATED_LINUX_VM")
    import resource
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_BYTES, MAX_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (180, 180))
    decode_ordered("/home/user/media")
