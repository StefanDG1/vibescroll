"""Prepare pinned runtime and optional fresh model files before a source job.

The caller verifies this helper's immutable bundle before running it. Existing
directories are never repaired or used as installation targets. A new event may
need a new runtime even when its separately verified model files remain present.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import posixpath
import re
import shutil
import stat
import subprocess
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile

PLAN_SHA256 = "6be806ea3c3cb13bab7b01b6c711b83cd3543ef19a0071f78133ae46f14ffb83"
PLAN_PATH = Path(__file__).with_name("native-asr-setup-plan.lock.json")
MAX_FILES = 50000
MAX_RUNTIME_BYTES = 1024 * 1024 * 1024
MAX_COMBINED_BYTES = 2 * 1024 * 1024 * 1024
DISPOSABLE_TOOLS_ALLOWANCE = 40 * 1024 * 1024
MAX_DOWNLOAD_WORKERS = 4


def plain(path, *, missing=False):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("runtime_path_invalid")
    for item in [path, *path.parents]:
        try:
            info = item.lstat()
        except FileNotFoundError:
            if item == path and missing:
                continue
            raise ValueError("runtime_parent_missing") from None
        if stat.S_ISLNK(info.st_mode):
            raise ValueError("runtime_path_symlink")
    return path


def load_plan(path=PLAN_PATH):
    with plain(path).open("rb") as source:
        raw = source.read(20001)
    if len(raw) > 20000 or hashlib.sha256(raw).hexdigest() != PLAN_SHA256:
        raise ValueError("runtime_plan_pin_mismatch")
    plan = json.loads(raw)
    if (len(plan["wheels"]) != 24 or plan["sourceJobs"] != 0 or
            plan["paidApi"] or plan["limits"]["automaticRetries"] != 0):
        raise ValueError("runtime_plan_invalid")
    return plan


def pin_file(path, expected):
    path = plain(path)
    before = path.stat()
    if not stat.S_ISREG(before.st_mode) or before.st_size != expected["bytes"]:
        raise ValueError("runtime_download_size_mismatch")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        remaining = expected["bytes"]
        while remaining:
            chunk = stream.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ValueError("runtime_download_size_mismatch")
            digest.update(chunk)
            remaining -= len(chunk)
        if stream.read(1):
            raise ValueError("runtime_download_size_mismatch")
    after = path.stat()
    if ((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) !=
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or
            digest.hexdigest() != expected["sha256"]):
        raise ValueError("runtime_download_hash_mismatch")


def public_url(value):
    parsed = urllib.parse.urlsplit(value)
    hosts = {"github.com", "release-assets.githubusercontent.com",
             "objects.githubusercontent.com", "files.pythonhosted.org"}
    if (parsed.scheme != "https" or parsed.hostname not in hosts or
            parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("runtime_download_destination_invalid")
    return value


def model_url(value):
    parsed = urllib.parse.urlsplit(value)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or
            not (host == "huggingface.co" or host.endswith(".huggingface.co") or host.endswith(".hf.co")) or
            parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("runtime_model_destination_invalid")
    return value


class PinnedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ModelRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        model_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(item, target, deadline, opener=None, *, validate_url=public_url):
    """One GET, ordinary verified HTTPS/proxy transport, no automatic retry."""
    validate_url(item["url"])
    if target.exists():
        raise ValueError("runtime_download_target_exists")
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError("runtime_setup_deadline")
    opener = opener or urllib.request.build_opener(PinnedRedirect)
    request = urllib.request.Request(item["url"], headers={"Accept-Encoding": "identity"})
    received = 0
    digest = hashlib.sha256()
    with opener.open(request, timeout=min(30, remaining)) as response, target.open("xb") as out:
        while True:
            if time.monotonic() >= deadline:
                raise ValueError("runtime_setup_deadline")
            chunk = response.read(min(1024 * 1024, item["bytes"] + 1 - received))
            if not chunk:
                break
            received += len(chunk)
            if received > item["bytes"]:
                raise ValueError("runtime_download_size_mismatch")
            digest.update(chunk)
            out.write(chunk)
    if received != item["bytes"] or digest.hexdigest() != item["sha256"]:
        raise ValueError("runtime_download_pin_mismatch")


def download_model(item, target, deadline):
    return download(item, target, deadline,
                    urllib.request.build_opener(ModelRedirect), validate_url=model_url)


def archive_path(value):
    path = PurePosixPath(value)
    if (not value or len(value) > 500 or path.is_absolute() or ".." in path.parts or
            "\\" in value or ":" in value or "\0" in value):
        raise ValueError("runtime_archive_path_invalid")
    return path


def fetch_pins(items, downloads, deadline, fetch):
    """Join each bounded batch before another starts; never retry a failed pin."""
    for item in items:
        if Path(item["filename"]).name != item["filename"]:
            raise ValueError("runtime_download_name_invalid")
    if not items:
        return
    with ThreadPoolExecutor(max_workers=min(MAX_DOWNLOAD_WORKERS, len(items))) as pool:
        for offset in range(0, len(items), MAX_DOWNLOAD_WORKERS):
            if time.monotonic() >= deadline:
                raise ValueError("runtime_setup_deadline")
            batch = items[offset:offset + MAX_DOWNLOAD_WORKERS]

            def checked(item):
                target = downloads / item["filename"]
                fetch(item, target, deadline)
                pin_file(target, item)

            futures = [pool.submit(checked, item) for item in batch]
            wait(futures)
            # All owned workers have finished, including when a pin failed.
            # No later batch or installer can run after that failure.
            for future in futures:
                future.result()


def prepare_model(directory, plan, deadline, *, fetch=download_model):
    """Provision four exact files in a fresh root, without importing inference."""
    directory = plain(directory, missing=True)
    if directory.exists():
        raise ValueError("fresh_model_directory_required")
    model = plan["model"]["model"]
    names = {"model.bin", "config.json", "tokenizer.json", "vocabulary.txt"}
    if set(model["files"]) != names or set(plan["modelURLs"]) != names:
        raise ValueError("runtime_model_plan_invalid")
    items = []
    for name, pin in model["files"].items():
        url = plan["modelURLs"][name]
        if url != f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{name}":
            raise ValueError("runtime_model_plan_invalid")
        model_url(url)
        items.append(dict(pin, filename=name, url=url))
    total = sum(item["bytes"] for item in items)
    other_bytes = sum(regular_bytes(item)[1] for item in directory.parent.iterdir()
                      if item.name.startswith(".vibescroll-") and not item.is_symlink() and item.is_dir())
    if (total > plan["limits"]["maximumDownloadBytes"] or
            other_bytes + total + 4096 + DISPOSABLE_TOOLS_ALLOWANCE > MAX_COMBINED_BYTES):
        raise ValueError("runtime_combined_cache_budget_invalid")
    directory.mkdir(mode=0o700)
    started = time.monotonic()
    fetch_pins(items, directory, deadline, fetch)
    if time.monotonic() >= deadline:
        raise ValueError("runtime_setup_deadline")
    manifest = {"repository": model["repository"], "revision": model["revision"],
                "files": {name: pin["sha256"] for name, pin in model["files"].items()}}
    encoded = (json.dumps(manifest, sort_keys=True) + "\n").encode()
    if len(encoded) > 4096:
        raise ValueError("runtime_receipt_limit")
    temporary = directory / ".model-ready.partial"
    with temporary.open("xb") as output:
        output.write(encoded)
    os.replace(temporary, directory / "vibescroller-model.json")
    return {"directory": str(directory), "modelDownloads": len(items),
            "downloadBytes": total, "modelConstructors": 0, "sourceJobs": 0,
            "seconds": round(time.monotonic() - started, 3)}


def unpack_python(archive, directory, maximum):
    with tarfile.open(archive, "r:gz") as source:
        entries = source.getmembers()
        if len(entries) > MAX_FILES:
            raise ValueError("runtime_archive_count_limit")
        seen, total = set(), 0
        for entry in entries:
            name = archive_path(entry.name)
            if name.parts[0] != "python" or entry.name in seen:
                raise ValueError("runtime_archive_entry_invalid")
            seen.add(entry.name)
            if not (entry.isfile() or entry.isdir() or entry.issym() or entry.islnk()):
                raise ValueError("runtime_archive_type_invalid")
            if entry.issym() or entry.islnk():
                link = entry.linkname
                if (not link or len(link) > 500 or link.startswith("/") or
                        any(c in link for c in ("\\", ":", "\0"))):
                    raise ValueError("runtime_archive_link_invalid")
                resolved = posixpath.normpath(posixpath.join(str(name.parent), link) if entry.issym() else link)
                if not resolved.startswith("python/"):
                    raise ValueError("runtime_archive_link_escape")
            total += entry.size
            if entry.size > 256 * 1024 * 1024 or total > maximum:
                raise ValueError("runtime_archive_expansion_limit")
            tarfile.data_filter(entry, str(directory))
        source.extractall(directory, members=entries, filter="data")
    return len(entries), total


def check_wheel(path, maximum):
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 10000:
            raise ValueError("runtime_wheel_count_limit")
        names, total = set(), 0
        for entry in entries:
            archive_path(entry.filename)
            if entry.filename in names or stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError("runtime_wheel_entry_invalid")
            names.add(entry.filename)
            total += entry.file_size
            if entry.file_size > 256 * 1024 * 1024 or total > maximum:
                raise ValueError("runtime_wheel_expansion_limit")
        return total


def run(command, directory, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError("runtime_setup_deadline")
    environment = {k: v for k, v in os.environ.items() if k in (
        "PATH", "HOME", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
        "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE")}
    environment.update(UV_OFFLINE="1", UV_NO_CONFIG="1", UV_PYTHON_DOWNLOADS="never",
                       PYTHONDONTWRITEBYTECODE="1", TMPDIR=str(directory / "temporary"))
    result = subprocess.run(command, cwd=directory, env=environment, capture_output=True,
                            timeout=min(120, remaining), check=False)
    if result.returncode or len(result.stdout) + len(result.stderr) > 1024 * 1024:
        stage = "venv" if "venv" in command else "wheel_install" if "install" in command else "metadata_probe"
        diagnostic = {"stage": stage, "exitCode": result.returncode,
                      "stderr": result.stderr[:32768].decode("utf-8", errors="replace"),
                      "stderrTruncated": len(result.stderr) > 32768}
        (directory / "runtime-command-failure.json").write_text(json.dumps(diagnostic))
        raise ValueError("runtime_" + stage + "_failed")
    return result.stdout


def regular_bytes(directory):
    count, total = 0, 0
    for parent, dirs, files in os.walk(directory, followlinks=False):
        dirs[:] = [name for name in dirs if not (Path(parent) / name).is_symlink()]
        for name in files:
            info = (Path(parent) / name).lstat()
            count += 1
            if count > MAX_FILES:
                raise ValueError("runtime_file_count_limit")
            if stat.S_ISREG(info.st_mode):
                total += info.st_size
    return count, total


def verify_installed_payloads(directory, wheels):
    site = directory / "venv/lib/python3.13/site-packages"
    seen, count = set(), 0
    for wheel in wheels:
        source = directory / "downloads" / wheel["filename"]
        pin_file(source, wheel)
        with zipfile.ZipFile(source) as archive:
            for entry in archive.infolist():
                name = archive_path(entry.filename)
                if entry.is_dir() or name.name == "RECORD" and name.parent.name.endswith(".dist-info"):
                    continue  # The installer rewrites only its bookkeeping record.
                parts = name.parts
                if parts[0].endswith(".data"):
                    if len(parts) < 3 or parts[1] not in ("purelib", "platlib"):
                        raise ValueError("runtime_wheel_install_mapping_unsupported")
                    parts = parts[2:]
                target = plain(site.joinpath(*parts))
                if target in seen or not target.is_file() or target.stat().st_size != entry.file_size:
                    raise ValueError("runtime_installed_payload_changed")
                seen.add(target)
                expected_hash = hashlib.sha256(archive.read(entry)).hexdigest()
                pin_file(target, {"bytes": entry.file_size, "sha256": expected_hash})
                count += 1
    return count


def prepare(directory, plan, *, fetch=download, deadline=None):
    directory = plain(directory, missing=True)
    if directory.exists():
        raise ValueError("fresh_runtime_directory_required")
    other_bytes = sum(regular_bytes(item)[1] for item in directory.parent.iterdir()
                      if item.name.startswith(".vibescroll-") and not item.is_symlink() and item.is_dir())
    maximum = min(plan["limits"]["maximumExpandedCacheBytes"], MAX_RUNTIME_BYTES)
    if other_bytes + maximum + DISPOSABLE_TOOLS_ALLOWANCE > MAX_COMBINED_BYTES:
        raise ValueError("runtime_combined_cache_budget_invalid")
    if platform.system() != "Linux" or platform.machine().lower() != "x86_64":
        raise ValueError("runtime_host_unsupported")
    libc, version = platform.libc_ver()
    if libc != "glibc" or tuple(map(int, version.split(".")[:2])) < (2, 28):
        raise ValueError("runtime_glibc_unsupported")
    uv = shutil.which("uv")
    if not uv or subprocess.run([uv, "--version"], capture_output=True, timeout=5).stdout.split()[:2] != [b"uv", b"0.13.4"]:
        raise ValueError("runtime_installer_unavailable")
    setup_started = time.monotonic()
    deadline = min(deadline or float("inf"), setup_started + plan["limits"]["maximumSeconds"])
    items = [dict(plan["python"], filename="python.tar.gz"), *plan["wheels"]]
    if (len(items) > 25 or sum(i["bytes"] for i in items) > plan["limits"]["maximumDownloadBytes"] or
            len({i["filename"] for i in items}) != len(items)):
        raise ValueError("runtime_download_budget_invalid")
    directory.mkdir(mode=0o700)
    downloads = directory / "downloads"
    downloads.mkdir(mode=0o700)
    (directory / "temporary").mkdir(mode=0o700)
    fetch_pins(items, downloads, deadline, fetch)
    downloads_finished = time.monotonic()
    unpack_python(downloads / "python.tar.gz", directory, maximum)
    expanded = sum(check_wheel(downloads / wheel["filename"], maximum) for wheel in plan["wheels"])
    if regular_bytes(directory)[1] + expanded > maximum:
        raise ValueError("runtime_expanded_budget_invalid")
    python = directory / "python/bin/python3.13"
    run([uv, "--offline", "--no-config", "--no-cache", "venv", "--python", str(python),
         "--no-project", str(directory / "venv")], directory, deadline)
    interpreter = directory / "venv/bin/python"
    run([uv, "--offline", "--no-config", "--no-cache", "pip", "install", "--python", str(interpreter),
         "--no-deps", "--no-index", "--no-build", "--link-mode", "copy",
         *[str(downloads / w["filename"]) for w in plan["wheels"]]], directory, deadline)
    # Metadata only. Model construction and media imports belong in V2 children.
    probe = "import importlib.metadata as m,json,sys;print(json.dumps({'python':list(sys.version_info[:3]),'packages':{d.metadata['Name'].lower().replace('_','-'):d.version for d in m.distributions()}}))"
    observed = json.loads(run([str(interpreter), "-I", "-B", "-c", probe], directory, deadline))
    expected = {w["name"].lower().replace("_", "-"): w["version"] for w in plan["wheels"]}
    if observed != {"python": [3, 13, 17], "packages": expected}:
        raise ValueError("runtime_installed_versions_mismatch")
    install_finished = time.monotonic()
    payloads = verify_installed_payloads(directory, plan["wheels"])
    count, total = regular_bytes(directory)
    if total + 4096 > maximum:
        raise ValueError("runtime_expanded_budget_invalid")
    result = {"schemaVersion": "fresh-asr-runtime-v1", "planSHA256": PLAN_SHA256,
              "directory": str(directory), "interpreter": str(interpreter), "verifiedWheels": len(expected),
              "verifiedInstalledPayloads": payloads,
              "downloadRequests": len(items), "downloadBytes": sum(i["bytes"] for i in items),
              "maximumConcurrentDownloads": MAX_DOWNLOAD_WORKERS,
              "phaseSeconds": {
                  "downloads": round(downloads_finished - setup_started, 3),
                  "unpackInstallAndProbe": round(install_finished - downloads_finished, 3),
                  "installedPayloadVerification": round(time.monotonic() - install_finished, 3),
                  "totalBeforeReceipt": round(time.monotonic() - setup_started, 3)},
              "regularFilesBeforeReceipt": count, "regularBytesBeforeReceipt": total,
              "receiptMaximumBytes": 4096, "sourceJobs": 0, "modelDownloads": 0,
              "otherOwnedCacheBytesBefore": other_bytes, "runtimeMaximumBytes": maximum,
              "modelConstructors": 0, "paidApi": False, "maximumSeconds": plan["limits"]["maximumSeconds"]}
    # One positive proof is published only after all byte/version checks pass.
    # A second mutable status marker can disagree with those actual checks.
    # Never reuse an existing target, even when it contains an old proof.
    encoded = (json.dumps(result, sort_keys=True) + "\n").encode()
    if len(encoded) > 4096:
        raise ValueError("runtime_receipt_limit")
    temporary = directory / ".runtime-ready.json.partial"
    with temporary.open("xb") as output:
        output.write(encoded)
    os.replace(temporary, directory / "runtime-ready.json")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--model-directory")
    args = parser.parse_args()
    root = Path(args.directory)
    if root.parent != Path("/workspace/scratch") or not re.fullmatch(r"\.vibescroll-asr-runtime-[a-f0-9]{8,32}", root.name):
        raise ValueError("runtime_owned_root_required")
    plan = load_plan()
    deadline = time.monotonic() + plan["limits"]["maximumSeconds"]
    model_result = None
    if args.model_directory:
        model_root = Path(args.model_directory)
        if (model_root.parent != Path("/workspace/scratch") or
                not re.fullmatch(r"\.vibescroll-asr-model-[a-f0-9]{8,32}", model_root.name)):
            raise ValueError("runtime_owned_root_required")
        if root.exists():
            raise ValueError("fresh_runtime_directory_required")
        model_result = prepare_model(model_root, plan, deadline)
    result = prepare(root, plan, deadline=deadline)
    if model_result:
        result["modelSetup"] = model_result
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, tarfile.TarError, zipfile.BadZipFile) as error:
        # Transport exceptions can contain signed provider URLs. Never print them.
        code = str(error) if isinstance(error, ValueError) else ""
        safe = code if re.fullmatch(r"(?:runtime_[a-z_]+|fresh_(?:runtime|model)_directory_required)", code) else "pinned_runtime_bootstrap_failed"
        print(json.dumps({"ready": False, "error": safe, "sourceJobs": 0}))
        raise SystemExit(2)
