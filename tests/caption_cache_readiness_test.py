import base64
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).resolve().parents[1] / "packages/media/caption_cache_readiness.py"
spec = importlib.util.spec_from_file_location("caption_cache_readiness", MODULE)
ready = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ready)


class CaptionReadiness(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.records = {}
        for package in ("one", "two"):
            name = f"{package}/module.py"
            data = b"# synthetic pinned package\n"
            path = self.root / name
            path.parent.mkdir()
            path.write_bytes(data)
            record = f"{package}.dist-info/RECORD"
            raw = (f"{name},sha256={base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')},{len(data)}\n"
                   f"{record},,\n").encode()
            path = self.root / record
            path.parent.mkdir()
            path.write_bytes(raw)
            self.records[record] = {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

    def verify(self):
        return ready.verify_caption_cache(self.root, self.records)

    def test_counts_hashed_payload_and_record_self_entries_separately(self):
        result = self.verify()
        self.assertEqual(result["hashedPayloadFiles"], 2)
        self.assertEqual(result["recordSelfEntries"], 2)
        self.assertEqual(result["totalRegularFiles"], 4)
        self.assertEqual(result["writes"], 0)

    def test_rejects_modified_payload_even_at_same_size(self):
        path = self.root / "one/module.py"
        path.write_bytes(b"x" * path.stat().st_size)
        with self.assertRaisesRegex(ValueError, "caption_payload_changed"):
            self.verify()

    def test_rejects_rewritten_record_even_if_payload_was_changed_to_match(self):
        path = self.root / "one.dist-info/RECORD"
        path.write_bytes(path.read_bytes().replace(b"module.py", b"other_.py"))
        with self.assertRaisesRegex(ValueError, "caption_record_pin_changed"):
            self.verify()

    def test_rejects_unrecorded_bytecode_and_other_files(self):
        for name in ("unexpected.pyc", "unreviewed.json"):
            path = self.root / name
            path.write_bytes(b"unexpected")
            with self.assertRaisesRegex(ValueError, "caption_inventory_changed"):
                self.verify()
            path.unlink()

    def test_rejects_missing_payload(self):
        (self.root / "one/module.py").unlink()
        with self.assertRaises(OSError):
            self.verify()

    def test_rejects_unrecorded_empty_directories(self):
        (self.root / "unrecorded").mkdir()
        with self.assertRaisesRegex(ValueError, "caption_inventory_changed"):
            self.verify()

    def test_rejects_paths_outside_the_cache(self):
        for name in ("../outside", "/outside", "one/../outside", "one\\outside", "C:/outside", "one//module.py"):
            with self.assertRaisesRegex(ValueError, "caption_record_path_invalid"):
                ready.relative_name(name)

    def test_rejects_symlink_payload(self):
        source = self.root / "one/module.py"
        target = self.root / "two/module.py"
        source.unlink()
        try:
            source.symlink_to(target)
        except OSError:
            self.skipTest("Symlink creation is unavailable on this host")
        with self.assertRaisesRegex(ValueError, "caption_symlink_or_special_file"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
