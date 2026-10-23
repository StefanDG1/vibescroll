"""Synthetic setup/inspection boundaries. No downloads, model load or inference."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import io

spec = importlib.util.spec_from_file_location("asr_setup", Path(__file__).parents[1] / "scripts/setup-local-asr.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).absolute()
        self.payloads = {name: ("synthetic-" + name).encode() for name in module.FILES}
        self.lock = copy.deepcopy(module.load_lock())
        self.lock["model"]["files"] = {name: {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()} for name, value in self.payloads.items()}

    def download(self, lock, name, path):
        path.write_bytes(self.payloads[name])

    def prepare(self, target, download=None):
        return module.prepare(target, self.lock, download or self.download, activate=lambda stage, destination: stage.rename(destination))

    def test_reviewed_lock_has_immutable_revision_and_exact_files(self):
        lock = module.load_lock()
        self.assertEqual(lock["model"]["revision"], module.REVISION)
        self.assertEqual(set(lock["model"]["files"]), module.FILES)
        self.assertEqual(lock["model"]["files"]["model.bin"]["bytes"], 483545366)

    def test_stages_verified_files_then_idempotently_preserves_existing_model(self):
        target = self.root / "model"
        self.assertTrue(self.prepare(target)["downloaded"])
        module.verify_directory(target, self.lock)
        original = {path.name: path.read_bytes() for path in target.iterdir()}
        self.assertFalse(self.prepare(target, lambda *_: self.fail("Unexpected download"))["downloaded"])
        self.assertEqual(original, {path.name: path.read_bytes() for path in target.iterdir()})

    def test_corrupt_download_never_activates_and_cleans_only_owned_stage(self):
        sentinel = self.root / "keep.txt"
        sentinel.write_text("unrelated")
        with self.assertRaisesRegex(ValueError, "MODEL_CHANGED"):
            self.prepare(self.root / "model", lambda lock, name, path: path.write_bytes(b"bad"))
        self.assertEqual({path.name for path in self.root.iterdir()}, {"keep.txt"})
        self.assertEqual(sentinel.read_text(), "unrelated")

    def test_existing_partial_and_changed_manifest_are_never_overwritten(self):
        target = self.root / "partial"
        target.mkdir()
        (target / "sentinel").write_text("keep")
        with self.assertRaises(ValueError):
            self.prepare(target)
        self.assertEqual((target / "sentinel").read_text(), "keep")
        complete = self.root / "complete"
        self.prepare(complete)
        (complete / module.MANIFEST).write_text("{}")
        with self.assertRaisesRegex(ValueError, "MANIFEST_CHANGED"):
            self.prepare(complete)
        self.assertEqual((complete / module.MANIFEST).read_text(), "{}")

    def test_known_bounded_cache_is_inert_but_unexpected_runtime_files_refused(self):
        target = self.root / "model"
        self.prepare(target)
        cache = target / ".cache/huggingface/download"
        cache.mkdir(parents=True)
        metadata = cache / "model.bin.metadata"
        metadata.write_text("This metadata is not parsed or trusted")
        module.verify_directory(target, self.lock)
        metadata.write_bytes(b"x" * 16385)
        with self.assertRaisesRegex(ValueError, "CACHE_INVALID"):
            module.verify_directory(target, self.lock)
        metadata.write_text("inert")
        (target / "model.py").write_text("must never execute")
        with self.assertRaisesRegex(ValueError, "FILES_INVALID"):
            module.verify_directory(target, self.lock)

    def test_manifest_mutation_during_weight_hash_is_detected(self):
        target = self.root / "model"
        self.prepare(target)
        verify = module.verify_file
        def changing(path, expected):
            verify(path, expected)
            (target / module.MANIFEST).write_text("{}")
        with patch.object(module.verification, "verify_file", changing):
            with self.assertRaises(ValueError):
                module.verify_directory(target, self.lock)

    def test_destination_created_during_download_is_preserved(self):
        target = self.root / "model"
        def racing(lock, name, path):
            self.download(lock, name, path)
            if not target.exists():
                target.mkdir()
                (target / "sentinel").write_text("keep")
        with self.assertRaisesRegex(ValueError, "DESTINATION_EXISTS"):
            self.prepare(target, racing)
        self.assertEqual((target / "sentinel").read_text(), "keep")

    def test_inspection_has_no_download_or_model_construction_and_redacts_paths(self):
        target = self.root / "model"
        self.prepare(target)
        with patch.object(module, "runtime_metadata", return_value=None), patch.object(module, "download_file", side_effect=AssertionError("No download")):
            report = module.inspect(target, self.lock)
        self.assertTrue(report["modelVerified"])
        self.assertTrue(report["runtimeVerified"])
        self.assertNotIn(str(self.root), json.dumps(report))
        with patch.object(module, "runtime_metadata", side_effect=ValueError("runtime absent")):
            self.assertFalse(module.inspect(target, self.lock)["runtimeVerified"])

    def test_path_escape_and_installed_immutable_root_are_refused(self):
        with self.assertRaisesRegex(ValueError, "PATH_INVALID"):
            self.prepare(self.root / ".." / "escape")
        with patch.dict(os.environ, {"LOCALAPPDATA": str(self.root)}):
            install = self.root / "VibeScroll/Companion"
            install.mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "INSTALL_ROOT_REFUSED"):
                self.prepare(install / "weights")

    def test_download_uses_locked_revision_and_refuses_unreviewed_redirects(self):
        target = self.root / "downloaded"
        name = "config.json"
        class Response(io.BytesIO):
            pass
        class Opener:
            def open(inner, url, timeout):
                self.assertIn(f"/resolve/{module.REVISION}/{name}", url)
                self.assertEqual(timeout, 60)
                return Response(self.payloads[name])
        with patch("urllib.request.build_opener", return_value=Opener()) as build:
            module.download_file(self.lock, name, target)
        self.assertEqual(target.read_bytes(), self.payloads[name])
        redirect = build.call_args.args[0]()
        for url in ["http://huggingface.co/file", "https://foreign.example.test/file", "https://user:password@cdn.hf.co/file"]:
            with self.assertRaisesRegex(ValueError, "REDIRECT_REFUSED"):
                redirect.redirect_request(None, None, 302, "", {}, url)

    def test_download_is_bounded_before_activation(self):
        class Opener:
            def open(inner, url, timeout):
                return io.BytesIO(b"x" * (self.lock["model"]["files"]["config.json"]["bytes"] + 1))
        with patch("urllib.request.build_opener", return_value=Opener()):
            with self.assertRaisesRegex(ValueError, "DOWNLOAD_SIZE_INVALID"):
                module.download_file(self.lock, "config.json", self.root / "too-large")

    def test_top_level_scan_stops_at_seventh_entry(self):
        class Entries:
            count = 0
            def __enter__(inner):
                return inner
            def __exit__(inner, *args):
                pass
            def __iter__(inner):
                return inner
            def __next__(inner):
                inner.count += 1
                if inner.count > 7:
                    self.fail("Unbounded model directory scan")
                return type("Entry", (), {"name": f"entry{inner.count}"})()
        entries = Entries()
        with patch("os.scandir", return_value=entries):
            with self.assertRaisesRegex(ValueError, "FILES_INVALID"):
                module.directory_names(self.root)
        self.assertEqual(entries.count, 7)


if __name__ == "__main__":
    unittest.main()
