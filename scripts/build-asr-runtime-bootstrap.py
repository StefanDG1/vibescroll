"""Verify the immutable, tools-only ASR bootstrap download without networking."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "packages/media"
LOCK = MEDIA / "native-asr-bootstrap.lock.json"


def bundle():
    files = {}
    for name in ("bootstrap_asr_runtime.py", "native-asr-setup-plan.lock.json"):
        source = MEDIA / name
        if source.is_symlink():
            raise ValueError("invalid_bootstrap_source")
        files[name] = source.read_bytes().replace(b"\r\n", b"\n")
    files["LICENSE"] = (ROOT / "LICENSE").read_bytes().replace(b"\r\n", b"\n")
    if (hashlib.sha256(files["native-asr-setup-plan.lock.json"]).hexdigest() !=
            "6be806ea3c3cb13bab7b01b6c711b83cd3543ef19a0071f78133ae46f14ffb83" or
            sum(map(len, files.values())) > 65536):
        raise ValueError("invalid_bootstrap_plan_or_size")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in files.items():
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100600 << 16
            archive.writestr(entry, content)
    return output.getvalue(), files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true")
    args = parser.parse_args()
    payload, files = bundle()
    digest = hashlib.sha256(payload).hexdigest()
    expected = {
        "schemaVersion": "native-asr-bootstrap-bundle-v1",
        "path": "/downloads/asr-runtime-bootstrap-" + digest[:16] + ".zip",
        "bytes": len(payload), "sha256": digest,
        "expandedMaximumBytes": 65536,
        "files": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for name, data in files.items()},
    }
    if json.loads(LOCK.read_bytes()) != expected:
        raise ValueError("bootstrap_bundle_lock_requires_review")
    target = ROOT / "apps/starter/public" / expected["path"].lstrip("/")
    if target.is_symlink():
        raise ValueError("invalid_bootstrap_target")
    if args.build and not target.exists():
        target.write_bytes(payload)
    if not target.is_file() or target.read_bytes() != payload:
        raise ValueError("immutable_bootstrap_download_missing_or_changed")
    print(json.dumps({"verified": True, "path": expected["path"], "bytes": len(payload),
                      "sha256": digest, "files": len(files), "networkRequests": 0}))


if __name__ == "__main__":
    main()
