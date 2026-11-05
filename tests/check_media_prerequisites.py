"""Fail before the decoder suite when real decoding prerequisites are absent.

This checks existing tools only. It installs nothing and dispatches no media job.
"""
import argparse
import importlib
import json
import platform
import shutil
import subprocess
import sys


def check(*, tools_only=False):
    tools = {name: shutil.which(name) for name in ("ffmpeg", "ffprobe")}
    missing = [name for name, path in tools.items() if not path]
    if missing:
        raise RuntimeError(
            "MEDIA_TEST_PREREQUISITE_MISSING: " + ", ".join(missing)
            + ". Ordered video tests must not silently skip. Supply these tools "
            "on the approved runner PATH; this job does not install system packages. "
            "See docs/operations/media-test-dependencies.md."
        )
    versions = {}
    for name, path in tools.items():
        result = subprocess.run(
            [path, "-version"], check=True, capture_output=True,
            text=True, timeout=10,
        )
        versions[name] = result.stdout.splitlines()[0]
    report = {"python": platform.python_version(), "tools": versions}
    if not tools_only:
        if sys.version_info[:2] != (3, 12):
            raise RuntimeError("MEDIA_TEST_PYTHON_MISMATCH: CI lock requires CPython 3.12.")
        pillow = importlib.import_module("PIL")
        if pillow.__version__ != "11.3.0":
            raise RuntimeError("MEDIA_TEST_PILLOW_MISMATCH: use the hashlocked project venv (Pillow 11.3.0).")
        report["pillow"] = pillow.__version__
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tools-only", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(check(tools_only=args.tools_only), indent=2))
    except (RuntimeError, ImportError, subprocess.SubprocessError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
