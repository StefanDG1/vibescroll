"""Prepare immutable ASR weights, or inspect metadata without inference."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import sys
import tempfile

# Python -I omits the script directory from module search paths. Load only the
# packaged helper at its explicit location, never from the working directory.
_helper = Path(__file__).absolute().parents[1] / "packages/media/asr_verification.py"
_spec = importlib.util.spec_from_file_location("vibescroll_asr_verification", _helper)
verification = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verification)
LOCK_PATH = verification.LOCK_PATH
FILES, REVISION, MANIFEST = verification.FILES, verification.REVISION, verification.MANIFEST
plain_path, stamp = verification.plain_path, verification.stamp
load_lock, expected_manifest = verification.load_lock, verification.expected_manifest
verify_file, verify_cache = verification.verify_file, verification.verify_cache
directory_names, verify_directory = verification.directory_names, verification.verify_directory
runtime_metadata = verification.runtime_metadata


def inspect(directory, lock):
    verify_directory(directory, lock)
    runtime_verified = True
    try:
        runtime_metadata(lock)
    except Exception:
        runtime_verified = False
    return {"kind": "local_asr_metadata", "version": 1, "modelVerified": True,
            "runtimeVerified": runtime_verified, "modelRevision": lock["model"]["revision"],
            "runtimeVersion": lock["runtime"]["fasterWhisperVersion"] if runtime_verified else None,
            "pythonVersion": platform.python_version()}


def download_file(lock, name, destination):
    # Only explicit setup can download. Inspection has no download dependencies.
    import urllib.request
    from urllib.parse import urlparse

    class ReviewedRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, response, code, message, headers, target):
            parsed = urlparse(target)
            if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or not parsed.hostname or
                    not (parsed.hostname == "huggingface.co" or parsed.hostname.endswith(".hf.co"))):
                raise ValueError("LOCAL_ASR_DOWNLOAD_REDIRECT_REFUSED")
            return super().redirect_request(request, response, code, message, headers, target)

    model = lock["model"]
    url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{name}"
    expected = model["files"][name]["bytes"]
    with urllib.request.build_opener(ReviewedRedirect).open(url, timeout=60) as response, destination.open("xb") as output:
        total = 0
        while chunk := response.read(min(1024 * 1024, expected + 1 - total)):
            total += len(chunk)
            if total > expected:
                raise ValueError("LOCAL_ASR_DOWNLOAD_SIZE_INVALID")
            output.write(chunk)
        if total != expected:
            raise ValueError("LOCAL_ASR_DOWNLOAD_SIZE_INVALID")


def prepare(destination, lock, download=download_file, activate=None):
    destination = plain_path(destination, missing=True)
    if os.environ.get("LOCALAPPDATA"):
        install_root = Path(os.environ["LOCALAPPDATA"]) / "VibeScroll/Companion"
        if destination == install_root or install_root in destination.parents:
            raise ValueError("LOCAL_ASR_INSTALL_ROOT_REFUSED")
    if destination.exists():
        verify_directory(destination, lock)
        return {"downloaded": False, "existingVerified": True, "revision": lock["model"]["revision"]}
    if activate is None and os.name != "nt":
        raise ValueError("LOCAL_ASR_SETUP_WINDOWS_REQUIRED")
    parent = plain_path(destination.parent)
    if not parent.is_dir():
        raise ValueError("LOCAL_ASR_PATH_INVALID")
    staging = Path(tempfile.mkdtemp(prefix=".vibescroll-asr-stage-", dir=parent))
    staging_stamp = stamp(staging)[:2]
    try:
        for name in lock["model"]["files"]:
            download(lock, name, staging / name)
            verify_file(staging / name, lock["model"]["files"][name])
        with (staging / MANIFEST).open("x", encoding="utf-8") as output:
            json.dump(expected_manifest(lock), output, indent=2)
        verify_directory(staging, lock)
        plain_path(parent)
        plain_path(staging)
        if destination.exists() or destination.is_symlink():
            raise ValueError("LOCAL_ASR_DESTINATION_EXISTS")
        if activate is None:
            # Windows rename refuses every existing destination, never replaces it.
            staging.rename(destination)
        else:
            activate(staging, destination)
        return {"downloaded": True, "existingVerified": False, "revision": lock["model"]["revision"]}
    finally:
        if staging.exists() and stamp(staging)[:2] == staging_stamp:
            plain_path(staging)
            shutil.rmtree(staging)  # Only this newly created staging directory.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("destination")
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    os.environ.update(HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", PYTHONNOUSERSITE="1")
    lock = load_lock()
    report = inspect(args.destination, lock) if args.inspect else prepare(args.destination, lock)
    print(json.dumps(report))
    return 0 if not args.inspect or report["runtimeVerified"] else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("LOCAL_ASR_SETUP_OR_INSPECTION_FAILED", file=sys.stderr)
        sys.exit(2)
