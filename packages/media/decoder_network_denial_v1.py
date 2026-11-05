"""Standalone Linux decoder child launcher, not part of the current Cloud package.

Use a fresh child process: python -I decoder_network_denial_v1.py -- /absolute/tool args.
This permanently denies socket syscalls in that process and its descendants.
It is not a filesystem, CPU, process, provider or complete host isolation boundary.
Acquisition must finish before invoking it. Never invoke install_denial in a
long-lived host or a process that still owns source-network work.

Only the Linux x86-64 syscall ABI is admitted. The numbers below are that ABI's
socket/IPC and asynchronous-I/O entrypoints, not portable syscall numbers. Other
architectures need a separately reviewed adapter; there is no permissive path.
"""

import ctypes
import errno
import os
from pathlib import Path
import platform
import socket
import stat
import struct
import sys


POLICY_VERSION = "linux-decoder-socket-denial-v1"
_AUDIT_ARCH_X86_64 = 0xC000003E
_X32_SYSCALL_BIT = 0x40000000
_PR_SET_NO_NEW_PRIVS = 38
_PR_SET_SECCOMP = 22
_SECCOMP_MODE_FILTER = 2
_SECCOMP_RET_KILL_PROCESS = 0x80000000
_SECCOMP_RET_ALLOW = 0x7FFF0000
_SECCOMP_RET_ERRNO = 0x00050000

# Block socket creation/use even for inherited descriptors, all socket families,
# io_uring's alternate networking path, and cross-process descriptor injection.
_DENIED_SYSCALLS = (
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
    101,  # ptrace
    288, 299, 307,  # accept4, recvmmsg, sendmmsg
    310, 311,  # process_vm_readv, process_vm_writev
    425, 426, 427,  # io_uring_setup, io_uring_enter, io_uring_register
    438,  # pidfd_getfd
)


class DecoderDenialUnavailable(RuntimeError):
    """A failed admission check; decoder execution must not follow."""


class _SockFilter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte),
                ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint32)]


class _SockFprog(ctypes.Structure):
    _fields_ = [("length", ctypes.c_ushort),
                ("filter", ctypes.POINTER(_SockFilter))]


def _admit_host():
    if sys.platform != "linux":
        raise DecoderDenialUnavailable("decoder_denial_requires_linux")
    if platform.machine().lower() != "x86_64" or struct.calcsize("P") != 8:
        raise DecoderDenialUnavailable("decoder_denial_unsupported_architecture")
    if os.getuid() == 0 or os.geteuid() == 0:
        raise DecoderDenialUnavailable("decoder_denial_requires_unprivileged_child")
    try:
        status = dict(line.split(":", 1) for line in
                      Path("/proc/self/status").read_text().splitlines() if ":" in line)
        if any(int(status[key].strip(), 16) != 0 for key in ("CapEff", "CapPrm", "CapAmb")):
            raise DecoderDenialUnavailable("decoder_denial_capabilities_present")
        if len(os.listdir("/proc/self/task")) != 1:
            raise DecoderDenialUnavailable("decoder_denial_requires_fresh_child")
    except (OSError, ValueError, KeyError) as error:
        raise DecoderDenialUnavailable("decoder_denial_process_state_unavailable") from error


def _close_inherited_descriptors():
    # No socket-valued standard input/output may survive the boundary. All other
    # inherited descriptors are closed, including a connected broker descriptor.
    for fd in (0, 1, 2):
        try:
            if stat.S_ISSOCK(os.fstat(fd).st_mode):
                raise DecoderDenialUnavailable("decoder_denial_socket_stdio")
        except OSError as error:
            if error.errno != errno.EBADF:
                raise DecoderDenialUnavailable("decoder_denial_stdio_unavailable") from error
    try:
        descriptors = os.listdir("/proc/self/fd")
        for name in descriptors:
            fd = int(name)
            if fd > 2:
                try:
                    os.close(fd)
                except OSError as error:
                    if error.errno != errno.EBADF:
                        raise
        # listdir's own transient descriptor has already closed when it returns.
        for name in os.listdir("/proc/self/fd"):
            fd = int(name)
            if fd > 2:
                try:
                    os.fstat(fd)
                except OSError as error:
                    if error.errno == errno.EBADF:
                        continue
                    raise
                raise DecoderDenialUnavailable("decoder_denial_descriptor_survived")
    except (OSError, ValueError) as error:
        raise DecoderDenialUnavailable("decoder_denial_descriptor_close_failed") from error


def _filter_program():
    # Classic BPF over struct seccomp_data: nr at offset0, arch at offset4.
    # A changed ABI kills the process instead of interpreting foreign numbers.
    instructions = [
        (0x20, 0, 0, 4),
        (0x15, 1, 0, _AUDIT_ARCH_X86_64),
        (0x06, 0, 0, _SECCOMP_RET_KILL_PROCESS),
        (0x20, 0, 0, 0),
        (0x35, 0, 1, _X32_SYSCALL_BIT),
        (0x06, 0, 0, _SECCOMP_RET_KILL_PROCESS),
    ]
    for number in _DENIED_SYSCALLS:
        instructions.extend(((0x15, 0, 1, number),
                             (0x06, 0, 0, _SECCOMP_RET_ERRNO | errno.EPERM)))
    instructions.append((0x06, 0, 0, _SECCOMP_RET_ALLOW))
    filters = (_SockFilter * len(instructions))(
        *(_SockFilter(*instruction) for instruction in instructions))
    return filters, _SockFprog(len(instructions), filters)


def _libc():
    try:
        library = ctypes.CDLL(None, use_errno=True)
        library.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong,
                                  ctypes.c_ulong, ctypes.c_ulong]
        library.prctl.restype = ctypes.c_int
        library.syscall.restype = ctypes.c_long
        return library
    except (AttributeError, OSError) as error:
        raise DecoderDenialUnavailable("decoder_denial_kernel_api_unavailable") from error


def _verify_socket_denial(library):
    # A real raw syscall check, not a Python monkeypatch or proxy failure. These
    # probes never connect or send packets, even if filtering did not work.
    for family in (socket.AF_UNIX, socket.AF_INET, socket.AF_INET6):
        ctypes.set_errno(0)
        result = library.syscall(ctypes.c_long(41), ctypes.c_int(family),
                                 ctypes.c_int(socket.SOCK_STREAM), ctypes.c_int(0))
        failure = ctypes.get_errno()
        if result >= 0:
            os.close(result)
        if result != -1 or failure != errno.EPERM:
            raise DecoderDenialUnavailable("decoder_denial_socket_probe_failed")


def install_denial():
    """Irreversibly constrain this fresh child, then verify kernel enforcement."""
    _admit_host()
    _install_after_admission()


def _install_after_admission():
    """Shared filter mechanics; each version must admit its host first."""
    _close_inherited_descriptors()
    library = _libc()
    filters, program = _filter_program()
    if library.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        raise DecoderDenialUnavailable("decoder_denial_no_new_privs_failed")
    pointer = ctypes.cast(ctypes.pointer(program), ctypes.c_void_p).value
    if library.prctl(_PR_SET_SECCOMP, _SECCOMP_MODE_FILTER, pointer, 0, 0) != 0:
        raise DecoderDenialUnavailable("decoder_denial_filter_install_failed")
    # Keep the filter storage alive through prctl. The kernel copies the program.
    del filters
    _verify_socket_denial(library)


def _decoder_environment():
    # Retain managed transport variables deliberately: the OS filter, rather
    # than removal of a proxy variable, must make decoding offline. Credentials
    # and Python search overrides are never copied into the executable child.
    names = ("PATH", "LANG", "LC_ALL", "HOME", "TMPDIR",
             "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
             "http_proxy", "https_proxy", "all_proxy", "no_proxy",
             "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE")
    return {**{key: os.environ[key] for key in names if key in os.environ},
            "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1"}


def _run_decoder(arguments, installer):
    args = list(sys.argv[1:] if arguments is None else arguments)
    if (not args or args.pop(0) != "--" or not args or len(args) > 128 or
            sum(len(arg.encode()) for arg in args) > 16384 or
            any("\0" in arg for arg in args)):
        raise DecoderDenialUnavailable("decoder_denial_invalid_command")
    executable = Path(args[0])
    if not executable.is_absolute() or not executable.is_file() or not os.access(executable, os.X_OK):
        raise DecoderDenialUnavailable("decoder_denial_requires_absolute_executable")
    environment = _decoder_environment()
    installer()
    os.execve(str(executable), args, environment)


def main(arguments=None):
    _run_decoder(arguments, install_denial)


if __name__ == "__main__":
    try:
        main()
    except DecoderDenialUnavailable as error:
        print(str(error), file=sys.stderr)
        sys.exit(78)
    except OSError:
        print("decoder_denial_exec_failed", file=sys.stderr)
        sys.exit(78)
