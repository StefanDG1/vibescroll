"""No requests or source media. Linux enforcement checks execute only locally.

Run: python tests/decoder_network_denial_test.py
Windows runs admission/failure tests and explicitly skips Linux syscall checks.
"""

import ctypes
import errno
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch


MODULE = Path(__file__).parents[1] / "packages/media/decoder_network_denial_v1.py"
spec = importlib.util.spec_from_file_location("decoder_denial", MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class AdmissionTests(unittest.TestCase):
    def test_unsupported_os_never_executes_decoder(self):
        with patch.object(worker.sys, "platform", "win32"), patch.object(worker.os, "execve") as execute:
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "requires_linux"):
                worker.main(["--", str(Path(sys.executable).resolve()), "-c", "raise AssertionError()"])
            execute.assert_not_called()

    def test_unsupported_architecture_never_executes_decoder(self):
        with patch.object(worker.sys, "platform", "linux"), patch.object(worker.platform, "machine", return_value="aarch64"), patch.object(worker.os, "execve") as execute:
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "unsupported_architecture"):
                worker.main(["--", str(Path(sys.executable).resolve())])
            execute.assert_not_called()

    def test_relative_or_unbounded_command_never_installs_filter(self):
        for command in (["python", "-c", "pass"], ["--", "python"],
                        ["--", str(Path(sys.executable).resolve()), "x" * 16385]):
            with self.subTest(command_length=len(command)), patch.object(worker, "install_denial") as install:
                with self.assertRaises(worker.DecoderDenialUnavailable):
                    worker.main(command)
                install.assert_not_called()

    def test_permission_or_kernel_refusal_never_executes_decoder(self):
        for results, message in (([-1], "no_new_privs_failed"), ([0, -1], "filter_install_failed")):
            library = Mock()
            library.prctl.side_effect = results
            with self.subTest(message=message), patch.object(worker, "_admit_host"), patch.object(worker, "_close_inherited_descriptors"), patch.object(worker, "_libc", return_value=library), patch.object(worker.os, "execve") as execute:
                with self.assertRaisesRegex(worker.DecoderDenialUnavailable, message):
                    worker.main(["--", str(Path(sys.executable).resolve())])
                library.syscall.assert_not_called()
                execute.assert_not_called()

    def test_successful_filter_report_without_real_socket_denial_still_refuses(self):
        library = Mock()
        library.prctl.return_value = 0
        library.syscall.return_value = -1
        with patch.object(worker, "_admit_host"), patch.object(worker, "_close_inherited_descriptors"), patch.object(worker, "_libc", return_value=library), patch.object(worker.socket, "AF_UNIX", 1, create=True), patch.object(worker.os, "execve") as execute:
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "socket_probe_failed"):
                worker.main(["--", str(Path(sys.executable).resolve())])
            execute.assert_not_called()

    def test_privileged_child_or_missing_process_state_is_refused(self):
        with patch.object(worker.sys, "platform", "linux"), patch.object(worker.platform, "machine", return_value="x86_64"), patch.object(worker.os, "getuid", return_value=0, create=True), patch.object(worker.os, "geteuid", return_value=0, create=True):
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "unprivileged_child"):
                worker._admit_host()
        with patch.object(worker.sys, "platform", "linux"), patch.object(worker.platform, "machine", return_value="x86_64"), patch.object(worker.os, "getuid", return_value=1000, create=True), patch.object(worker.os, "geteuid", return_value=1000, create=True), patch.object(worker.Path, "read_text", side_effect=OSError()):
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "process_state_unavailable"):
                worker._admit_host()

    def test_socket_stdio_cannot_survive_the_boundary(self):
        with patch.object(worker.os, "fstat", return_value=Mock(st_mode=worker.stat.S_IFSOCK)):
            with self.assertRaisesRegex(worker.DecoderDenialUnavailable, "socket_stdio"):
                worker._close_inherited_descriptors()

    def test_capabilities_and_existing_threads_are_not_treated_as_a_fresh_child(self):
        for capabilities, tasks, reason in (("1", ["1"], "capabilities_present"),
                                             ("0", ["1", "2"], "requires_fresh_child")):
            status = f"CapEff:\t{capabilities}\nCapPrm:\t0\nCapAmb:\t0\n"
            with self.subTest(reason=reason), patch.object(worker.sys, "platform", "linux"), patch.object(worker.platform, "machine", return_value="x86_64"), patch.object(worker.os, "getuid", return_value=1000, create=True), patch.object(worker.os, "geteuid", return_value=1000, create=True), patch.object(worker.Path, "read_text", return_value=status), patch.object(worker.os, "listdir", return_value=tasks):
                with self.assertRaisesRegex(worker.DecoderDenialUnavailable, reason):
                    worker._admit_host()

    def test_real_cli_refuses_this_host_when_it_is_not_admitted(self):
        if sys.platform == "linux" and platform.machine().lower() == "x86_64" and os.geteuid() != 0:
            self.skipTest("this host is exercised by the real Linux enforcement tests")
        result = subprocess.run([sys.executable, "-I", str(MODULE), "--", str(Path(sys.executable).resolve()),
                                 "-c", "print('DECODER_MUST_NOT_RUN')"],
                                capture_output=True, text=True, timeout=10, check=False)
        self.assertEqual(result.returncode, 78, result.stderr)
        self.assertNotIn("DECODER_MUST_NOT_RUN", result.stdout)
        self.assertIn("decoder_denial_", result.stderr)

    def test_proxy_environment_does_not_copy_application_credentials(self):
        values = {"PATH": "/synthetic", "HTTPS_PROXY": "http://proxy.invalid:9",
                  "https_proxy": "http://proxy.invalid:9", "SSL_CERT_FILE": "/synthetic/ca",
                  "OPENAI_API_KEY": "synthetic", "PYTHONPATH": "/unreviewed",
                  "VIBESCROLL_LEASE_TOKEN": "synthetic"}
        with patch.dict(worker.os.environ, values, clear=True):
            environment = worker._decoder_environment()
        self.assertEqual(environment, {"PATH": "/synthetic", "HTTPS_PROXY": "http://proxy.invalid:9",
                                      "https_proxy": "http://proxy.invalid:9", "SSL_CERT_FILE": "/synthetic/ca",
                                      "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1"})

    def test_filter_denies_foreign_and_x32_abis_and_alternate_network_paths(self):
        filters, _ = worker._filter_program()

        def evaluate(arch, number):
            position, accumulator = 0, 0
            while position < len(filters):
                instruction = filters[position]
                if instruction.code == 0x20:
                    accumulator = arch if instruction.k == 4 else number
                elif instruction.code in (0x15, 0x35):
                    matches = accumulator == instruction.k if instruction.code == 0x15 else accumulator >= instruction.k
                    position += instruction.jt if matches else instruction.jf
                elif instruction.code == 0x06:
                    return instruction.k
                else:
                    self.fail("unknown filter operation")
                position += 1
            self.fail("filter did not terminate")

        self.assertEqual(evaluate(0x40000003, 102), worker._SECCOMP_RET_KILL_PROCESS)
        self.assertEqual(evaluate(worker._AUDIT_ARCH_X86_64, 0x40000029), worker._SECCOMP_RET_KILL_PROCESS)
        for number in (41, 42, 53, 46, 47, 288, 299, 307, 425, 426, 427, 438):
            self.assertEqual(evaluate(worker._AUDIT_ARCH_X86_64, number), worker._SECCOMP_RET_ERRNO | errno.EPERM)
        self.assertEqual(evaluate(worker._AUDIT_ARCH_X86_64, 1), worker._SECCOMP_RET_ALLOW)


LINUX_CHILD = sys.platform == "linux" and platform.machine().lower() == "x86_64" and os.geteuid() != 0
if os.environ.get("VIBESCROLL_REQUIRE_DECODER_DENIAL_TESTS") == "1" and not LINUX_CHILD:
    raise RuntimeError("required_decoder_kernel_tests_cannot_be_skipped_on_this_host")


@unittest.skipUnless(LINUX_CHILD, "requires an unprivileged local Linux x86-64 Python; no host admission claimed")
class LinuxEnforcementTests(unittest.TestCase):
    def run_child(self, code, **options):
        return subprocess.run([sys.executable, "-I", str(MODULE), "--", str(Path(sys.executable).resolve()), "-I", "-c", code],
                              stdin=subprocess.DEVNULL, capture_output=True, text=True,
                              timeout=15, check=False, **options)

    def test_actual_socket_syscalls_denied_with_proxy_and_in_exec_descendant(self):
        code = r'''
import ctypes, errno, json, os, socket, subprocess, sys
denied = []
for family in (socket.AF_UNIX, socket.AF_INET, socket.AF_INET6):
    try:
        value = socket.socket(family, socket.SOCK_STREAM)
    except OSError as error:
        assert error.errno == errno.EPERM
        denied.append(family)
    else:
        value.close()
        raise AssertionError("socket allowed")
try:
    socket.socketpair()
except OSError as error:
    assert error.errno == errno.EPERM
else:
    raise AssertionError("socketpair allowed")
libc = ctypes.CDLL(None, use_errno=True)
libc.syscall.restype = ctypes.c_long
for number in (41, 425, 426, 427, 438):
    ctypes.set_errno(0)
    assert libc.syscall(number, -1, -1, -1, -1, -1, -1) == -1
    assert ctypes.get_errno() == errno.EPERM
descendant = subprocess.run([sys.executable, "-I", "-c", "import socket; socket.socket()"],
                           capture_output=True, text=True, timeout=5)
assert descendant.returncode != 0 and "PermissionError" in descendant.stderr
print(json.dumps({"families_denied": len(denied), "descendant_denied": True,
                  "proxy_inherited": os.environ.get("HTTPS_PROXY") == "http://proxy.invalid:9"}))
'''
        environment = {**os.environ, "HTTPS_PROXY": "http://proxy.invalid:9", "ALL_PROXY": "http://proxy.invalid:9"}
        result = self.run_child(code, env=environment)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"families_denied": 3, "descendant_denied": True, "proxy_inherited": True})

    def test_inherited_descriptor_is_closed_before_decoder_exec(self):
        reader, writer = os.pipe()
        try:
            code = f"import errno,os\ntry: os.fstat({writer})\nexcept OSError as e: assert e.errno==errno.EBADF\nelse: raise AssertionError('inherited descriptor survived')"
            result = self.run_child(code, pass_fds=(writer,))
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            os.close(reader)
            os.close(writer)


if __name__ == "__main__":
    unittest.main()
