"""Synthetic prerequisite failures; no downloads or external tool processes."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("media_prerequisites", Path(__file__).with_name("check_media_prerequisites.py"))
prerequisites = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prerequisites)


class MediaPrerequisiteTests(unittest.TestCase):
    def test_missing_ffprobe_fails_before_running_tools_or_importing_pillow(self):
        with patch.object(prerequisites.shutil, "which", side_effect=["/synthetic/ffmpeg", None]), patch.object(prerequisites.subprocess, "run") as run, patch.object(prerequisites.importlib, "import_module") as load:
            with self.assertRaisesRegex(RuntimeError, "MEDIA_TEST_PREREQUISITE_MISSING: ffprobe"):
                prerequisites.check()
            run.assert_not_called()
            load.assert_not_called()

    def test_tools_only_verifies_existing_binaries_without_importing_pillow(self):
        with patch.object(prerequisites.shutil, "which", side_effect=["/synthetic/ffmpeg", "/synthetic/ffprobe"]), patch.object(prerequisites.subprocess, "run", return_value=SimpleNamespace(stdout="synthetic version\n")) as run, patch.object(prerequisites.importlib, "import_module") as load:
            self.assertEqual(set(prerequisites.check(tools_only=True)["tools"]), {"ffmpeg", "ffprobe"})
            self.assertEqual(run.call_count, 2)
            load.assert_not_called()

    def test_wrong_pillow_fails_instead_of_using_a_global_package(self):
        with patch.object(prerequisites.shutil, "which", return_value="/synthetic/tool"), patch.object(prerequisites.subprocess, "run", return_value=SimpleNamespace(stdout="synthetic version\n")), patch.object(prerequisites.sys, "version_info", (3, 12)), patch.object(prerequisites.importlib, "import_module", return_value=SimpleNamespace(__version__="12.0.0")):
            with self.assertRaisesRegex(RuntimeError, "MEDIA_TEST_PILLOW_MISMATCH"):
                prerequisites.check()


if __name__ == "__main__":
    unittest.main()
