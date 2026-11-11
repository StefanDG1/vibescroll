"""Verify the pinned caption wheels without importing them or changing the cache.

RECORD self-entries have no payload hash. Verify those files against their
reviewed wheel pins, then hash every declared payload and reject extra files.
This is an integrity check, not host/network admission or source authority.
"""
import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat


RECORDS = {
    "pysubs2-1.9.0.dist-info/RECORD": {
        "bytes": 2209,
        "sha256": "dc237d245a3e53cb89bb96e263bddbe2fb02b49766ded50fd7b8b00356366c29",
    },
    "yt_dlp-2026.10.21.dist-info/RECORD": {
        "bytes": 90284,
        "sha256": "7e9ffcc777a819e296790424df562e76248e643e467ea47238c74a7f7ac07a0c",
    },
}
MAX_FILES = 3000
MAX_BYTES = 40 * 1024 * 1024
MAX_FILE_BYTES = 4 * 1024 * 1024


def stamp(metadata):
    return metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns


def relative_name(raw):
    path = PurePosixPath(raw)
    if (not raw or "\\" in raw or ":" in raw or "\x00" in raw
            or path.is_absolute() or ".." in path.parts
            or path.as_posix() != raw):
        raise ValueError("caption_record_path_invalid")
    return raw


def read_file(root, name):
    path = root.joinpath(*PurePosixPath(relative_name(name)).parts)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_FILE_BYTES:
        raise ValueError("caption_file_invalid")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        if stamp(os.fstat(stream.fileno())) != stamp(before):
            raise ValueError("caption_file_changed")
        data = stream.read(MAX_FILE_BYTES + 1)
        if (len(data) != before.st_size
                or stamp(os.fstat(stream.fileno())) != stamp(before)):
            raise ValueError("caption_file_changed")
    if stamp(path.lstat()) != stamp(before):
        raise ValueError("caption_file_changed")
    return data


def inventory(root):
    files, directories, total, entries = set(), set(), 0, 0
    pending = [root]
    while pending:
        with os.scandir(pending.pop()) as children:
            for child in children:
                entries += 1
                if entries > MAX_FILES * 2:
                    raise ValueError("caption_inventory_over_limit")
                metadata = child.stat(follow_symlinks=False)
                name = Path(child.path).relative_to(root).as_posix()
                relative_name(name)
                if stat.S_ISDIR(metadata.st_mode):
                    directories.add(name)
                    pending.append(Path(child.path))
                elif stat.S_ISREG(metadata.st_mode):
                    files.add(name)
                    total += metadata.st_size
                    if len(files) > MAX_FILES or total > MAX_BYTES:
                        raise ValueError("caption_inventory_over_limit")
                else:
                    raise ValueError("caption_symlink_or_special_file")
    return files, directories, total


def verify_caption_cache(directory, records=RECORDS):
    root = Path(directory)
    if (not root.is_absolute() or root.resolve() != root or not root.is_dir()
            or any(parent.is_symlink() for parent in [root, *root.parents])):
        raise ValueError("caption_cache_path_invalid")
    actual, directories, total = inventory(root)
    expected, payload_hashes = set(), {}
    for record, pin in records.items():
        raw = read_file(root, record)
        if len(raw) != pin["bytes"] or hashlib.sha256(raw).hexdigest() != pin["sha256"]:
            raise ValueError("caption_record_pin_changed")
        self_entries = 0
        for row in csv.reader(io.StringIO(raw.decode("utf-8"))):
            if len(row) != 3:
                raise ValueError("caption_record_invalid")
            name, encoded, size = row
            relative_name(name)
            if name in expected or len(expected) >= MAX_FILES:
                raise ValueError("caption_record_duplicate_or_over_limit")
            expected.add(name)
            if name == record:
                if encoded or size:
                    raise ValueError("caption_record_self_entry_invalid")
                self_entries += 1
                continue
            if not encoded.startswith("sha256=") or not size.isdecimal():
                raise ValueError("caption_record_payload_invalid")
            expected_hash = base64.b64decode(encoded[7:] + "=" * (-len(encoded[7:]) % 4), altchars=b"-_", validate=True)
            data = read_file(root, name)
            digest = hashlib.sha256(data).digest()
            if len(expected_hash) != 32 or len(data) != int(size) or digest != expected_hash:
                raise ValueError("caption_payload_changed")
            payload_hashes[name] = digest.hex()
        if self_entries != 1:
            raise ValueError("caption_record_self_entry_missing")
    expected_directories = {
        parent.as_posix() for name in expected
        for parent in PurePosixPath(name).parents if parent.as_posix() != "."
    }
    if actual != expected or directories != expected_directories:
        raise ValueError("caption_inventory_changed")
    after = inventory(root)
    if after != (actual, directories, total):
        raise ValueError("caption_inventory_changed")
    aggregate = hashlib.sha256(json.dumps(payload_hashes, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"ready": True, "hashedPayloadFiles": len(payload_hashes),
            "recordSelfEntries": len(records), "totalRegularFiles": len(actual),
            "bytes": total, "payloadSHA256": aggregate,
            "thirdPartyImports": 0, "networkRequests": 0, "writes": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()
    try:
        result = verify_caption_cache(args.directory)
    except (ValueError, OSError, UnicodeError, csv.Error):
        print(json.dumps({"ready": False, "reason": "caption_cache_integrity_failed", "writes": 0}))
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
