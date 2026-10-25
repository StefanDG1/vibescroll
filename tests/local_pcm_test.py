"""Boundary tests for local normalized audio; no model or provider call."""
import importlib.util
import copy
import hashlib
import json
import os
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("local_whisper", Path(__file__).parents[1] / "packages/media/local_whisper.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PCMTests(unittest.TestCase):
    def test_self_authored_consistent_model_manifest_is_not_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            payload = b"synthetic replacement weights"
            manifest = {"repository": "Systran/faster-whisper-small.en", "revision": "a" * 40,
                        "files": {name: hashlib.sha256(payload).hexdigest() for name in
                                  ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]}}
            for name in manifest["files"]:
                (path / name).write_bytes(payload)
            (path / "vibescroller-model.json").write_text(json.dumps(manifest))
            with patch.object(module.verification, "verify_runtime", return_value=None):
                with self.assertRaises(ValueError):
                    module.verify_model(path)

    def test_terminal_timestamp_overrun_is_clipped_to_real_audio(self):
        self.assertEqual(module.bounded_segment_timing(33000, 36280, 34461), (33000, 34461, True))
        self.assertEqual(module.bounded_segment_timing(100, 200, 34461), (100, 200, False))

    def test_outside_audio_reversed_and_excessive_times_are_rejected(self):
        for start, end in [(-1, 200), (300, 200), (34461, 35000), (35000, 36000), (33000, 39462)]:
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(ValueError, "TIMING_INVALID"):
                    module.bounded_segment_timing(start, end, 34461)

    def test_normalized_audio_and_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio.wav"
            with wave.open(str(path), "wb") as output:
                output.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                output.writeframes(struct.pack("<h", 10) * 16000)
            pcm, duration, digest = module.normalized_pcm(path)
            self.assertEqual((len(pcm), duration, len(digest)), (32000, 1, 64))

    def test_other_rates_and_truncation_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio.wav"
            with wave.open(str(path), "wb") as output:
                output.setparams((1, 2, 44100, 0, "NONE", "not compressed"))
                output.writeframes(b"\0\0" * 44100)
            with self.assertRaisesRegex(ValueError, "NORMALIZED_PCM_REQUIRED"):
                module.normalized_pcm(path)
            data = bytearray(path.read_bytes())
            data[24:28] = struct.pack("<I", 16000)
            path.write_bytes(data[:-100])
            with self.assertRaisesRegex(ValueError, "TRUNCATED_INPUT"):
                module.normalized_pcm(path)

    def test_empty_missing_and_oversized_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio.wav"
            with self.assertRaisesRegex(ValueError, "INPUT_INVALID"):
                module.normalized_pcm(path)
            path.write_bytes(b"")
            with self.assertRaisesRegex(ValueError, "INPUT_LIMIT"):
                module.normalized_pcm(path)
            with path.open("wb") as output:
                output.truncate(19_500_001)
            with self.assertRaisesRegex(ValueError, "INPUT_LIMIT"):
                module.normalized_pcm(path)

    def test_unreviewed_hashes_and_manifest_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            manifest = {"repository": "Systran/faster-whisper-small.en", "revision": module.verification.REVISION,
                        "files": {name: "0" * 64 for name in module.verification.FILES}}
            for name in manifest["files"]:
                (path / name).write_bytes(b"synthetic test data")
            (path / "vibescroller-model.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "MANIFEST_CHANGED"):
                module.verify_model(path)
            manifest["files"]["../outside.bin"] = "0" * 64
            (path / "vibescroller-model.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "MANIFEST_CHANGED"):
                module.verify_model(path)


class ModelTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).absolute()
        self.model = self.root / "model"
        self.model.mkdir()
        self.lock = copy.deepcopy(module.verification.load_lock())
        for name, expected in self.lock["model"]["files"].items():
            payload = ("synthetic-" + name).encode()
            (self.model / name).write_bytes(payload)
            expected.update(bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest())
        self.manifest = self.model / module.verification.MANIFEST
        self.manifest.write_text(json.dumps(module.verification.expected_manifest(self.lock)))
        # Only model data is synthetic; the same per-job validator runs in full.
        self.addCleanup(patch.stopall)
        patch.object(module.verification, "load_lock", return_value=self.lock).start()
        patch.object(module.verification.sys, "version_info", (3, 13, 1)).start()
        patch.object(module.verification.platform, "python_implementation", return_value="CPython").start()
        patch.object(module.verification, "version", return_value="1.2.1").start()

    def test_each_job_requires_locked_model_and_preserves_inert_legacy_cache(self):
        cache = self.model / ".cache/huggingface"
        (cache / "download").mkdir(parents=True)
        (cache / "trees").mkdir()
        metadata = [cache / ".gitignore", cache / "CACHEDIR.TAG",
                    cache / f"trees/{module.verification.REVISION}.json"]
        metadata += [cache / f"download/{name}.metadata" for name in module.verification.FILES]
        for path in metadata:
            path.write_bytes(b"inert and deliberately invalid JSON")
        before = {path: path.read_bytes() for path in metadata}
        self.assertEqual(module.verify_model(self.model), module.verification.REVISION)
        self.assertEqual(before, {path: path.read_bytes() for path in metadata})

    def test_consistent_manifest_cannot_replace_locked_hash_or_revision(self):
        for field in ["revision", "hash"]:
            with self.subTest(field=field):
                manifest = module.verification.expected_manifest(self.lock)
                if field == "revision":
                    manifest["revision"] = "a" * 40
                else:
                    payload = b"replacement model"
                    (self.model / "model.bin").write_bytes(payload)
                    manifest["files"]["model.bin"] = hashlib.sha256(payload).hexdigest()
                self.manifest.write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "MANIFEST_CHANGED"):
                    module.verify_model(self.model)

    def test_actual_weight_size_and_hash_are_required_even_with_locked_manifest(self):
        candidate = self.model / "model.bin"
        original = candidate.read_bytes()
        for payload in [b"x" * len(original), original + b"x"]:
            with self.subTest(size=len(payload)):
                candidate.write_bytes(payload)
                with self.assertRaisesRegex(ValueError, "MODEL_CHANGED"):
                    module.verify_model(self.model)

    def test_exact_file_set_is_required(self):
        vocabulary = self.model / "vocabulary.txt"
        original = vocabulary.read_bytes()
        vocabulary.unlink()
        with self.assertRaisesRegex(ValueError, "FILES_INVALID"):
            module.verify_model(self.model)
        vocabulary.write_bytes(original)
        (self.model / "preprocessor_config.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "FILES_INVALID"):
            module.verify_model(self.model)

    def test_junctions_or_symlinks_in_model_file_cache_and_ancestor_are_refused(self):
        alias = self.root / "alias"
        if os.name == "nt":
            import _winapi
            _winapi.CreateJunction(str(self.model), str(alias))
        else:
            alias.symlink_to(self.model, target_is_directory=True)
        try:
            with self.assertRaisesRegex(ValueError, "PATH_INVALID"):
                module.verify_model(alias)
        finally:
            alias.rmdir() if os.name == "nt" else alias.unlink()
        original_lstat = Path.lstat
        for candidate in [self.model / "model.bin", self.manifest, self.model / ".cache"]:
            if candidate.name == ".cache":
                candidate.mkdir()
            def reparse(path, *args, **kwargs):
                metadata = original_lstat(path, *args, **kwargs)
                if path == candidate:
                    return type("Reparse", (), {"st_mode": metadata.st_mode, "st_file_attributes": 0x400})()
                return metadata
            with self.subTest(path=candidate.name), patch.object(Path, "lstat", reparse):
                with self.assertRaisesRegex(ValueError, "PATH_INVALID"):
                    module.verify_model(self.model)

    def test_each_job_checks_python_line_and_faster_whisper_version(self):
        with patch.object(module.verification.sys, "version_info", (3, 14, 0)):
            with self.assertRaisesRegex(ValueError, "RUNTIME_CHANGED"):
                module.verify_model(self.model)
        with patch.object(module.verification, "version", return_value="1.2.2"):
            with self.assertRaisesRegex(ValueError, "RUNTIME_CHANGED"):
                module.verify_model(self.model)

    def test_growing_file_is_hashed_only_through_locked_size_plus_one_byte(self):
        candidate = self.model / "model.bin"
        original_open = Path.open
        requested = []
        class GrowingStream:
            def __enter__(inner):
                inner.stream = original_open(candidate, "rb")
                return inner
            def __exit__(inner, *args):
                inner.stream.close()
            def fileno(inner):
                return inner.stream.fileno()
            def read(inner, size):
                requested.append(size)
                return b"x" * size
        def growing(path, *args, **kwargs):
            return GrowingStream() if path == candidate else original_open(path, *args, **kwargs)
        with patch.object(Path, "open", growing):
            with self.assertRaisesRegex(ValueError, "MODEL_CHANGED"):
                module.verify_model(self.model)
        self.assertEqual(sum(requested), self.lock["model"]["files"]["model.bin"]["bytes"] + 1)

    def test_packaged_helper_is_loaded_by_absolute_path_under_untrusted_cwd(self):
        (self.root / "asr_verification.py").write_text("raise AssertionError('untrusted cwd import')")
        previous = Path.cwd()
        try:
            os.chdir(self.root)
            spec = importlib.util.spec_from_file_location("isolated_whisper", module.__file__)
            isolated = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(isolated)
            self.assertEqual(Path(isolated.verification.__file__), Path(module.__file__).with_name("asr_verification.py"))
        finally:
            os.chdir(previous)


if __name__ == "__main__":
    unittest.main()
