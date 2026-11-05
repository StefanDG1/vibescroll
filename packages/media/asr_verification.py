"""Offline model authority shared by setup inspection and each transcription job."""
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import re
import stat
import sys

LOCK_PATH = Path(__file__).absolute().with_name("asr-model.lock.json")
FILES = {"model.bin", "config.json", "tokenizer.json", "vocabulary.txt"}
REVISION = "d1d751a5f8271d482d14ca55d9e2deeebbae577f"
MANIFEST = "vibescroller-model.json"


def plain_path(value, missing=False):
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("LOCAL_ASR_PATH_INVALID")
    for item in [path, *path.parents]:
        try:
            metadata = item.lstat()
        except FileNotFoundError:
            if item == path and missing:
                continue
            raise ValueError("LOCAL_ASR_PATH_INVALID") from None
        if stat.S_ISLNK(metadata.st_mode) or getattr(metadata, "st_file_attributes", 0) & 0x400:
            raise ValueError("LOCAL_ASR_PATH_INVALID")
    return path


def metadata_stamp(metadata):
    return metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns


def stamp(path):
    return metadata_stamp(path.lstat())


def bounded_json(path, limit, error):
    plain_path(path)
    initial = stamp(path)
    if not stat.S_ISREG(path.lstat().st_mode) or not 0 < initial[2] <= limit:
        raise ValueError(error)
    with path.open("rb") as stream:
        if metadata_stamp(os.fstat(stream.fileno())) != initial:
            raise ValueError(error)
        content = stream.read(limit + 1)
        if len(content) > limit or metadata_stamp(os.fstat(stream.fileno())) != initial:
            raise ValueError(error)
    plain_path(path)
    if stamp(path) != initial:
        raise ValueError(error)
    return json.loads(content)


def load_lock():
    lock = bounded_json(LOCK_PATH, 10000, "LOCAL_ASR_LOCK_INVALID")
    model, runtime = lock["model"], lock["runtime"]
    if (set(lock) != {"schemaVersion", "model", "runtime"} or lock["schemaVersion"] != "local-asr-prerequisites-v1"
            or set(model) != {"repository", "revision", "files"} or model["repository"] != "Systran/faster-whisper-small.en"
            or model["revision"] != REVISION or set(model["files"]) != FILES
            or runtime != {"implementation": "CPython", "pythonMajor": 3, "pythonMinor": 13, "fasterWhisperVersion": "1.2.1"}):
        raise ValueError("LOCAL_ASR_LOCK_INVALID")
    for item in model["files"].values():
        if (set(item) != {"bytes", "sha256"} or type(item["bytes"]) is not int or not 0 < item["bytes"] <= 600000000
                or not isinstance(item["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"])):
            raise ValueError("LOCAL_ASR_LOCK_INVALID")
    return lock


def expected_manifest(lock):
    model = lock["model"]
    return {"repository": model["repository"], "revision": model["revision"],
            "files": {name: item["sha256"] for name, item in model["files"].items()}}


def verify_file(path, expected):
    plain_path(path)
    initial = stamp(path)
    if not path.is_file() or initial[2] != expected["bytes"]:
        raise ValueError("LOCAL_ASR_MODEL_CHANGED")
    with path.open("rb") as stream:
        if metadata_stamp(os.fstat(stream.fileno())) != initial:
            raise ValueError("LOCAL_ASR_MODEL_CHANGED")
        digest = hashlib.sha256()
        remaining = expected["bytes"]
        while remaining:
            chunk = stream.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ValueError("LOCAL_ASR_MODEL_CHANGED")
            digest.update(chunk)
            remaining -= len(chunk)
        if stream.read(1) or metadata_stamp(os.fstat(stream.fileno())) != initial:
            raise ValueError("LOCAL_ASR_MODEL_CHANGED")
    plain_path(path)
    if stamp(path) != initial or digest.hexdigest() != expected["sha256"]:
        raise ValueError("LOCAL_ASR_MODEL_CHANGED")


def verify_cache(directory):
    cache = plain_path(directory / ".cache")
    if not cache.is_dir():
        raise ValueError("LOCAL_ASR_CACHE_INVALID")
    directories = {"huggingface", "huggingface/download", "huggingface/trees"}
    files = {"huggingface/.gitignore", "huggingface/CACHEDIR.TAG", f"huggingface/trees/{REVISION}.json"}
    files |= {f"huggingface/download/{name}.metadata" for name in FILES}
    count, total = 0, 0
    pending = [cache]
    while pending:
        with os.scandir(pending.pop()) as entries:
            for entry in entries:
                count += 1
                if count > 20:
                    raise ValueError("LOCAL_ASR_CACHE_INVALID")
                item = plain_path(Path(entry.path))
                relative = item.relative_to(cache).as_posix()
                if item.is_dir():
                    if relative not in directories:
                        raise ValueError("LOCAL_ASR_CACHE_INVALID")
                    pending.append(item)
                elif not item.is_file() or relative not in files or item.stat().st_size > 16384:
                    raise ValueError("LOCAL_ASR_CACHE_INVALID")
                else:
                    total += item.stat().st_size
                if total > 65536:
                    raise ValueError("LOCAL_ASR_CACHE_INVALID")
    # Bookkeeping contents are deliberately never read or treated as authority.


def directory_names(directory):
    names = set()
    with os.scandir(directory) as entries:
        for entry in entries:
            names.add(entry.name)
            if len(names) > 6:
                raise ValueError("LOCAL_ASR_MODEL_FILES_INVALID")
    return names


def verify_directory(directory, lock):
    directory = plain_path(directory)
    expected_names = FILES | {MANIFEST}
    names = directory_names(directory)
    if names == expected_names | {".cache"}:
        verify_cache(directory)
    elif names != expected_names:
        raise ValueError("LOCAL_ASR_MODEL_FILES_INVALID")
    manifest = plain_path(directory / MANIFEST)
    before = stamp(manifest)
    if not manifest.is_file() or before[2] > 10000:
        raise ValueError("LOCAL_ASR_MODEL_MANIFEST_INVALID")
    if bounded_json(manifest, 10000, "LOCAL_ASR_MODEL_MANIFEST_INVALID") != expected_manifest(lock):
        raise ValueError("LOCAL_ASR_MODEL_MANIFEST_CHANGED")
    for name, expected in lock["model"]["files"].items():
        verify_file(directory / name, expected)
    plain_path(directory)
    plain_path(manifest)
    if (stamp(manifest) != before or directory_names(directory) != names
            or bounded_json(manifest, 10000, "LOCAL_ASR_MODEL_MANIFEST_INVALID") != expected_manifest(lock)):
        raise ValueError("LOCAL_ASR_MODEL_CHANGED")
    if ".cache" in names:
        verify_cache(directory)


def verify_runtime(lock):
    expected = lock["runtime"]
    if (platform.python_implementation() != expected["implementation"] or
            sys.version_info[:2] != (expected["pythonMajor"], expected["pythonMinor"]) or
            version("faster-whisper") != expected["fasterWhisperVersion"]):
        raise ValueError("LOCAL_ASR_RUNTIME_CHANGED")


def runtime_metadata(lock):
    verify_runtime(lock)
    # Importability only: no model construction, weights loaded or inference.
    import faster_whisper  # noqa: F401
    import ctranslate2  # noqa: F401
    import numpy  # noqa: F401
