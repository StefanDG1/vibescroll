import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
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

    def test_model_redirects_remain_on_provider_https(self):
        for url in ["https://huggingface.co/model", "https://cas-bridge.xethub.hf.co/file"]:
            self.assertEqual(runtime.model_url(url), url)
        for url in ["http://huggingface.co/model", "https://huggingface.co.evil.example/model",
                    "https://localhost/file", "https://a:b@huggingface.co/model"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                runtime.model_url(url)


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
    def test_pinned_downloads_overlap_in_batches_of_at_most_four(self):
        barrier = threading.Barrier(4)
        lock = threading.Lock()
        active = peak = 0
        completed = []
        data = b"fixed public package"
        items = [pinned(data, f"package-{index}.whl") for index in range(8)]

        def fetch(item, target, deadline):
            nonlocal active, peak
            self.assertGreater(deadline, time.monotonic())
            with lock:
                active += 1
                peak = max(peak, active)
            barrier.wait(timeout=3)
            target.write_bytes(data)
            with lock:
                active -= 1
                completed.append(item["filename"])

        with tempfile.TemporaryDirectory() as temporary:
            runtime.fetch_pins(items, Path(temporary), time.monotonic() + 10, fetch)
        self.assertEqual(peak, 4)
        self.assertEqual(active, 0)
        self.assertCountEqual(completed, [item["filename"] for item in items])

    def test_failed_parallel_batch_joins_workers_without_next_batch_or_retry(self):
        barrier = threading.Barrier(4)
        finished, started = [], []
        lock = threading.Lock()
        data = b"fixed public package"
        items = [pinned(data, f"package-{index}.whl") for index in range(8)]

        def fetch(item, target, deadline):
            with lock:
                started.append(item["filename"])
            barrier.wait(timeout=3)
            try:
                if item["filename"] == "package-1.whl":
                    raise ValueError("runtime_download_pin_mismatch")
                target.write_bytes(data)
            finally:
                with lock:
                    finished.append(item["filename"])

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(ValueError, "pin_mismatch"):
                runtime.fetch_pins(items, root, time.monotonic() + 10, fetch)
            self.assertCountEqual(started, [item["filename"] for item in items[:4]])
            self.assertCountEqual(finished, started)
            self.assertFalse(any(root.glob("package-[4-7].whl")))

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
            self.assertGreaterEqual(len(calls), 1)
            self.assertLessEqual(len(calls), 4)
            attempts = len(calls)
            installer.assert_not_called()
            self.assertFalse((root / "runtime-ready.json").exists())
            with self.assertRaisesRegex(ValueError, "fresh_runtime_directory_required"):
                runtime.prepare(root, plan, fetch=failed_fetch)
            self.assertEqual(len(calls), attempts)


class ModelSetupTest(unittest.TestCase):
    def fixture(self):
        data = {name: ("fixed " + name).encode() for name in
                ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")}
        model = {"repository": "Systran/faster-whisper-small.en",
                 "revision": "d1d751a5f8271d482d14ca55d9e2deeebbae577f",
                 "files": {name: {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}
                           for name, value in data.items()}}
        return data, {"model": {"model": model}, "modelURLs": {
            name: f"https://huggingface.co/Systran/faster-whisper-small.en/resolve/{model['revision']}/{name}"
            for name in data}, "limits": {"maximumDownloadBytes": 786432000}}

    def test_fresh_model_uses_all_pins_without_repairing_a_damaged_cache(self):
        data, plan = self.fixture()
        calls = []

        def fetch(item, target, deadline):
            calls.append(item["filename"])
            target.write_bytes(data[item["filename"]])

        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            damaged = parent / ".vibescroll-model-old"
            damaged.mkdir()
            (damaged / "model.bin").write_bytes(b"bad cached bytes")
            (damaged / ".model.bin.partial").write_bytes(b"partial")
            root = parent / ".vibescroll-asr-model-12345678"
            result = runtime.prepare_model(root, plan, time.monotonic() + 10, fetch=fetch)
            self.assertCountEqual(calls, data)
            self.assertEqual(result["modelDownloads"], 4)
            self.assertEqual(result["modelConstructors"], 0)
            self.assertEqual({p.name for p in root.iterdir()}, set(data) | {"vibescroller-model.json"})
            manifest = json.loads((root / "vibescroller-model.json").read_bytes())
            self.assertEqual(manifest["files"], {name: pin["sha256"] for name, pin in plan["model"]["model"]["files"].items()})
            self.assertEqual((damaged / "model.bin").read_bytes(), b"bad cached bytes")
            for name, value in data.items():
                self.assertEqual((root / name).read_bytes(), value)
            with self.assertRaisesRegex(ValueError, "fresh_model_directory_required"):
                runtime.prepare_model(root, plan, time.monotonic() + 10, fetch=fetch)
            self.assertEqual(len(calls), 4)

    def test_failed_model_pin_has_no_ready_marker_or_automatic_retry(self):
        _, plan = self.fixture()
        calls = []

        def failed(item, target, deadline):
            calls.append(item["filename"])
            raise ValueError("runtime_download_pin_mismatch")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / ".vibescroll-asr-model-12345678"
            with self.assertRaisesRegex(ValueError, "pin_mismatch"):
                runtime.prepare_model(root, plan, time.monotonic() + 10, fetch=failed)
            self.assertLessEqual(len(calls), 4)
            self.assertFalse((root / "vibescroller-model.json").exists())
            attempts = len(calls)
            with self.assertRaisesRegex(ValueError, "fresh_model_directory_required"):
                runtime.prepare_model(root, plan, time.monotonic() + 10, fetch=failed)
            self.assertEqual(len(calls), attempts)

    def test_expired_model_setup_never_downloads_or_publishes_readiness(self):
        _, plan = self.fixture()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / ".vibescroll-asr-model-12345678"
            with patch.object(runtime, "download_model") as fetch:
                with self.assertRaisesRegex(ValueError, "runtime_setup_deadline"):
                    runtime.prepare_model(root, plan, time.monotonic() - 1, fetch=fetch)
                fetch.assert_not_called()
            self.assertFalse((root / "vibescroller-model.json").exists())


if __name__ == "__main__":
    unittest.main()
