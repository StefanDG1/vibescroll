"""No source/network requests. Root-capability fixtures are not host admission."""
import importlib.util
import os
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).parents[1] / "packages/media/decoder_network_denial_v2.py"
spec = importlib.util.spec_from_file_location("decoder_provider_vm", MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

STATUS = "CapEff:\t0\nCapPrm:\t0\nCapInh:\t0\nCapAmb:\t0\nCapBnd:\t0\nNoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t1\n"


class ProviderVMAdmissionTests(unittest.TestCase):
    def admit(self, status=STATUS, uid=0, euid=0, tasks=("1",)):
        with patch.object(worker.sys, "platform", "linux"), patch.object(worker.platform, "machine", return_value="x86_64"), patch.object(worker.os, "getuid", return_value=uid, create=True), patch.object(worker.os, "geteuid", return_value=euid, create=True), patch.object(worker.Path, "read_text", return_value=status), patch.object(worker.os, "listdir", return_value=tasks):
            return worker._admit_host()

    def test_exact_already_restricted_capless_root_state_is_admitted_without_changing_it(self):
        with patch.object(worker.core, "_libc") as libc:
            self.admit()
        libc.assert_not_called()

    def test_any_capability_including_bounding_set_refuses_before_install_or_exec(self):
        for field in ("CapEff", "CapPrm", "CapInh", "CapAmb", "CapBnd"):
            with self.subTest(field=field), self.assertRaisesRegex(worker.DecoderDenialUnavailable, "capabilities_present"):
                self.admit(STATUS.replace(field + ":\t0", field + ":\t1"))

    def test_missing_existing_restrictions_or_state_never_relaxes_admission(self):
        for field, replacement, reason in (("NoNewPrivs", "0", "no_new_privs_required"), ("Seccomp", "0", "provider_filter_required"), ("Seccomp_filters", "0", "provider_filter_required")):
            with self.subTest(field=field), self.assertRaisesRegex(worker.DecoderDenialUnavailable, reason):
                self.admit(STATUS.replace(field + ":\t1" if field != "Seccomp" else field + ":\t2", field + ":\t" + replacement))
        for line in STATUS.splitlines(keepends=True):
            with self.subTest(missing=line), self.assertRaises(worker.DecoderDenialUnavailable):
                self.admit(STATUS.replace(line, ""))

    def test_mixed_identity_and_existing_threads_refuse(self):
        for uid, euid in ((0, 1000), (1000, 0)):
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "mixed_root_identity"):
                self.admit(uid=uid, euid=euid)
        with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "fresh_child"):
            self.admit(tasks=("1", "2"))

    def test_nonroot_path_preserves_v1_checks(self):
        with patch.object(worker.core, "_admit_host", side_effect=worker.DecoderDenialUnavailable("synthetic_original_refusal")) as original:
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "synthetic_original_refusal"):
                self.admit(uid=1000, euid=1000)
        original.assert_called_once()

    def test_refused_admission_never_installs_or_executes(self):
        with patch.object(worker, "_admit_host", side_effect=worker.DecoderDenialUnavailable("synthetic_refusal")), patch.object(worker.core, "_install_after_admission") as install, patch.object(worker.os, "execve") as execute:
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "synthetic_refusal"):
                worker.main(["--", str(Path(sys.executable).resolve()), "-I", "-c", "pass"])
        install.assert_not_called()
        execute.assert_not_called()

    @unittest.skipUnless(sys.platform == "linux", "real provider-VM adapter kernel test requires Linux")
    def test_real_v2_child_and_exec_descendant_inherit_network_denial(self):
        # Nonroot CI must run this. Root hosts are admitted only by the exact
        # original state above; this test never creates or weakens that state.
        try:
            worker._admit_host()
        except worker.DecoderDenialUnavailable as error:
            if os.environ.get("VIBESCROLL_REQUIRE_DECODER_DENIAL_TESTS") == "1":
                raise AssertionError("required_provider_vm_kernel_test_cannot_be_skipped") from error
            self.skipTest("this root host is not the already restricted provider configuration")
        code = "import socket,errno,subprocess,sys\nfor family in (socket.AF_UNIX,socket.AF_INET,socket.AF_INET6):\n try: socket.socket(family,socket.SOCK_STREAM)\n except OSError as e: assert e.errno==errno.EPERM\n else: raise AssertionError('socket allowed')\np=subprocess.run([sys.executable,'-I','-c','import socket;socket.socket()'],capture_output=True,text=True,timeout=5)\nassert p.returncode!=0 and 'PermissionError' in p.stderr\nprint('denied_in_child_and_exec_descendant')"
        result = subprocess.run([sys.executable, "-I", str(MODULE), "--", str(Path(sys.executable).resolve()), "-I", "-c", code], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "denied_in_child_and_exec_descendant")

    @unittest.skipUnless(sys.platform == "linux", "real synthetic decoder admission requires Linux")
    def test_actual_ffmpeg_and_ffprobe_work_under_the_same_denial(self):
        try:
            worker._admit_host()
        except worker.DecoderDenialUnavailable as error:
            if os.environ.get("VIBESCROLL_REQUIRE_DECODER_DENIAL_TESTS") == "1":
                raise AssertionError("required_provider_vm_decoder_test_cannot_be_skipped") from error
            self.skipTest("this root host is not the already restricted provider configuration")
        ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
        self.assertTrue(ffmpeg and ffprobe, "actual admitted decoder tools are required")
        with tempfile.TemporaryDirectory(prefix="vibescroll-vm-synthetic-") as directory:
            image = Path(directory) / "synthetic.jpg"
            prefix = [sys.executable, "-I", str(MODULE), "--"]
            encode = subprocess.run(prefix + [ffmpeg, "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=1", "-frames:v", "1", "-threads", "1", "-c:v", "mjpeg", "-f", "image2", str(image)], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
            self.assertEqual(encode.returncode, 0, encode.stderr)
            payload = image.read_bytes()
            self.assertTrue(payload.startswith(b"\xff\xd8") and payload.endswith(b"\xff\xd9"))
            self.assertLessEqual(len(payload), 81920)
            probe = subprocess.run(prefix + [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", str(image)], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
            self.assertEqual(probe.returncode, 0, probe.stderr)
            self.assertEqual(json.loads(probe.stdout)["streams"], [{"width": 32, "height": 32}])
        self.assertFalse(Path(directory).exists())


if __name__ == "__main__":
    unittest.main()
