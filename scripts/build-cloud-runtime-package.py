"""Check/build the pinned tools-only website download; no network or user files."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "packages/media"
LOCK = MEDIA / "cloud-runtime-package.lock.json"


def reviewed_bundle():
    manifest = json.loads((MEDIA / "cloud-extractor.lock.json").read_bytes())
    files = {}
    for name, expected in manifest["files"].items():
        if Path(name).name != name or (MEDIA / name).is_symlink():
            raise ValueError("invalid_runtime_tool_path")
        data = (MEDIA / name).read_bytes().replace(b"\r\n", b"\n")
        if len(data) != expected["bytes"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
            raise ValueError("accepted_caption_package_pin_changed")
        files[name] = data
    for name in ("cloud-extractor.lock.json", "decoder_network_denial_v1.py", "decoder_network_denial_v2.py"):
        if (MEDIA / name).is_symlink():
            raise ValueError("invalid_runtime_tool_path")
        files[name] = (MEDIA / name).read_bytes().replace(b"\r\n", b"\n")
    if (ROOT / "LICENSE").is_symlink():
        raise ValueError("invalid_runtime_license_path")
    files["LICENSE"] = (ROOT / "LICENSE").read_bytes().replace(b"\r\n", b"\n")
    if sum(len(data) for data in files.values()) > 128 * 1024:
        raise ValueError("runtime_expansion_over_limit")
    output = io.BytesIO()
    # Store tiny source files without a platform/zlib-dependent compressor.
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in files.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.compress_type = zipfile.ZIP_STORED
            entry.external_attr = 0o100600 << 16
            archive.writestr(entry, data)
    return output.getvalue(), files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true")
    args = parser.parse_args()
    payload, files = reviewed_bundle()
    expected = json.loads(LOCK.read_bytes())
    digest = hashlib.sha256(payload).hexdigest()
    path = "/downloads/cloud-runtime-" + digest[:16] + ".zip"
    pins = {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in files.items()}
    if (expected["schemaVersion"] != "cloud-runtime-bundle-v1" or
            expected["path"] != path or expected["sha256"] != digest or
            expected["bytes"] != len(payload) or expected["files"] != pins or
            expected["packageManifestSHA256"] != pins["cloud-extractor.lock.json"]["sha256"] or
            expected["expandedMaximumBytes"] != 128 * 1024 or
            expected["cacheMaximumBytes"] != 40 * 1024 * 1024 or
            expected["adapterPolicy"] != "linux-provider-vm-decoder-socket-denial-v2"):
        raise ValueError("runtime_bundle_lock_requires_explicit_review")
    target = ROOT / "apps/starter/public" / path.lstrip("/")
    if target.is_symlink():
        raise ValueError("invalid_runtime_bundle_target")
    if args.build:
        if target.exists() and target.read_bytes() != payload:
            raise ValueError("immutable_runtime_bundle_already_exists")
        target.parent.mkdir(exist_ok=True)
        if not target.exists():
            target.write_bytes(payload)
    if not target.is_file() or target.read_bytes() != payload:
        raise ValueError("website_runtime_bundle_missing_or_changed")
    print(json.dumps({"verified": True, "path": path, "bytes": len(payload),
                      "sha256": digest, "files": len(files), "networkRequests": 0}))


if __name__ == "__main__":
    main()
