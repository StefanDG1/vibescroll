import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("runtime_bootstrap", Path(__file__).resolve().parents[1] / "packages/media/bootstrap_asr_runtime.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def pinned(data, filename="synthetic.whl"):
    return {"url": "https://files.pythonhosted.org/packages/" + filename,
            "filename": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def python_tar(name="python/bin/python3.13", link=None):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        member = tarfile.TarInfo(name)
        if link:
            member.type, member.linkname = tarfile.SYMTYPE, link
            archive.addfile(member)
        else:
            member.size = 6
            archive.addfile(member, io.BytesIO(b"python"))
    return output.getvalue()


def wheel(name, entry=None):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr(entry or f"{name}/__init__.py", b"# synthetic pinned payload\n")
        archive.writestr(f"{name}-1.0.dist-info/RECORD", b"installer replaces bookkeeping\n")
    return output.getvalue()


class DownloadTest(unittest.TestCase):
    def test_plan_is_the_unchanged_reviewed_authority(self):
        plan = runtime.load_plan()
        self.assertEqual(len(plan["wheels"]), 24)
        self.assertEqual(plan["wheelBytes"], 127129904)
        self.assertEqual(plan["sourceJobs"], 0)

    def test_modified_plan_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "plan.json"
            path.write_text("{}")
            with self.assertRaisesRegex(ValueError, "pin_mismatch"):
                runtime.load_plan(path)

    def test_exact_download_and_all_pin_failures(self):
        for payload, accepted in [(b"abc", True), (b"ab", False), (b"abcd", False), (b"xyz", False)]:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as temporary:
                calls = []
                opener = SimpleNamespace(open=lambda request, timeout: calls.append(request.full_url) or io.BytesIO(payload))
                path = Path(temporary) / "pinned"
                if accepted:
                    runtime.download(pinned(b"abc"), path, time.monotonic() + 5, opener)
                    self.assertEqual(path.read_bytes(), b"abc")
                else:
                    with self.assertRaises(ValueError):
                        runtime.download(pinned(b"abc"), path, time.monotonic() + 5, opener)
                self.assertEqual(len(calls), 1)

    def test_no_existing_target_or_expired_operation_is_retried(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "owned"
            path.write_bytes(b"preserve")
            with self.assertRaisesRegex(ValueError, "exists"):
                runtime.download(pinned(b"abc"), path, time.monotonic() + 5)
            self.assertEqual(path.read_bytes(), b"preserve")
            with self.assertRaisesRegex(ValueError, "deadline"):
                runtime.download(pinned(b"abc"), path.with_name("missing"), time.monotonic() - 1)

    def test_transport_destinations_cannot_widen(self):
        for url in ["http://github.com/file", "https://localhost/file", "https://github.com:444/file", "https://a:b@github.com/file"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                runtime.public_url(url)
        self.assertTrue(runtime.public_url("https://release-assets.githubusercontent.com/a?token=ordinary-provider-redirect"))


class ArchiveTest(unittest.TestCase):
    def test_tar_traversal_and_escaping_links_fail(self):
        for name, link in [("../escape", None), ("/python/bin/x", None), ("python/link", "../../escape")]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / "python.tar.gz"
                archive.write_bytes(python_tar(name, link))
                with self.assertRaises((ValueError, tarfile.TarError)):
                    runtime.unpack_python(archive, root, 10000)
                self.assertFalse((root.parent / "escape").exists())

    def test_safe_tar_and_expansion_limit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "python.tar.gz"
            archive.write_bytes(python_tar())
            with self.assertRaisesRegex(ValueError, "expansion_limit"):
                runtime.unpack_python(archive, root, 5)
            self.assertEqual(runtime.unpack_python(archive, root, 100), (1, 6))

    def test_wheel_paths_and_expansion(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "wheel.whl"
            path.write_bytes(wheel("safe", "../escape"))
            with self.assertRaisesRegex(ValueError, "path_invalid"):
                runtime.check_wheel(path, 10000)
            path.write_bytes(wheel("safe"))
            with self.assertRaisesRegex(ValueError, "expansion_limit"):
                runtime.check_wheel(path, 1)


class PrepareTest(unittest.TestCase):
    def fixture(self):
        files = {"python.tar.gz": python_tar()}
        wheels = []
        for index in range(24):
            name = f"synthetic{index}"
            filename = f"{name}-1.0-py3-none-any.whl"
            files[filename] = wheel(name)
            wheels.append({**pinned(files[filename], filename), "name": name, "version": "1.0"})
        plan = {"python": pinned(files["python.tar.gz"], "python.tar.gz"), "wheels": wheels,
                "limits": {"maximumSeconds": 30, "maximumDownloadBytes": 1000000, "maximumExpandedCacheBytes": 1000000}}
        return files, plan

    def test_fresh_setup_is_offline_install_only_and_verifies_payloads(self):
        files, plan = self.fixture()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "fresh"
            commands, fetched = [], []

            def fetch(item, target, deadline):
                fetched.append(item["filename"])
                target.write_bytes(files[item["filename"]])

            def run(command, directory, deadline):
                commands.append(command)
                if "install" in command:
                    for item in plan["wheels"]:
                        with zipfile.ZipFile(directory / "downloads" / item["filename"]) as archive:
                            for entry in archive.infolist():
                                if entry.filename.endswith("/RECORD"):
                                    continue
                                target = directory / "venv/lib/python3.13/site-packages" / entry.filename
                                target.parent.mkdir(parents=True, exist_ok=True)
                                target.write_bytes(archive.read(entry))
                return json.dumps({"python": [3, 13, 17], "packages": {w["name"]: "1.0" for w in plan["wheels"]}}).encode()

            with patch.object(runtime.platform, "system", return_value="Linux"), patch.object(runtime.platform, "machine", return_value="x86_64"), patch.object(runtime.platform, "libc_ver", return_value=("glibc", "2.31")), patch.object(runtime.shutil, "which", return_value="synthetic-uv"), patch.object(runtime.subprocess, "run", return_value=SimpleNamespace(stdout=b"uv 0.13.4\n")), patch.object(runtime, "run", side_effect=run):
                result = runtime.prepare(root, plan, fetch=fetch)
            self.assertEqual(len(fetched), 25)
            self.assertEqual(result["verifiedInstalledPayloads"], 24)
            self.assertEqual(result["sourceJobs"], 0)
            self.assertEqual(result["modelDownloads"], 0)
            self.assertFalse((root / "UNREADY").exists())
            install = commands[1]
            for flag in ["--offline", "--no-deps", "--no-index", "--no-build", "--no-cache", "--no-config"]:
                self.assertIn(flag, install)
            damaged = root / "venv/lib/python3.13/site-packages/synthetic0/__init__.py"
            damaged.write_bytes(b"# changed pinned payload!!\n")
            with self.assertRaises(ValueError):
                runtime.verify_installed_payloads(root, plan["wheels"])
            before = (root / "runtime-ready.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "fresh_runtime_directory_required"):
                runtime.prepare(root, plan)
            self.assertEqual((root / "runtime-ready.json").read_bytes(), before)

    def test_failed_download_cannot_publish_a_ready_proof_or_retry(self):
        _, plan = self.fixture()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "fresh"
            calls = []

            def failed_fetch(item, target, deadline):
                calls.append(item["filename"])
                raise ValueError("runtime_download_pin_mismatch")

            with patch.object(runtime.platform, "system", return_value="Linux"), patch.object(runtime.platform, "machine", return_value="x86_64"), patch.object(runtime.platform, "libc_ver", return_value=("glibc", "2.31")), patch.object(runtime.shutil, "which", return_value="synthetic-uv"), patch.object(runtime.subprocess, "run", return_value=SimpleNamespace(stdout=b"uv 0.13.4\n")), patch.object(runtime, "run") as installer:
                with self.assertRaisesRegex(ValueError, "pin_mismatch"):
                    runtime.prepare(root, plan, fetch=failed_fetch)
            self.assertEqual(len(calls), 1)
            installer.assert_not_called()
            self.assertFalse((root / "runtime-ready.json").exists())
            with self.assertRaisesRegex(ValueError, "fresh_runtime_directory_required"):
                runtime.prepare(root, plan, fetch=failed_fetch)
            self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
