"""Network-only decoder adapter for an already restricted provider VM child.

V1's nonroot contract is unchanged. This separate adapter additionally accepts
UID/EUID0 only when all capabilities, including the bounding set, are already
zero, no_new_privs is already permanent, and a provider seccomp filter is active.
It grants no privilege, disables no existing restriction and supplies no VM or
filesystem boundary. The caller must establish the actual provider boundary.
This is not part of the current media-v2/v3 tool package or host admission.
"""
import importlib.util
import os
from pathlib import Path
import platform
import struct
import sys


_path = Path(__file__).with_name("decoder_network_denial_v1.py")
if _path.is_symlink():
    raise RuntimeError("decoder_denial_invalid_shared_module")
_spec = importlib.util.spec_from_file_location("decoder_denial_v1_core", _path)
core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(core)
DecoderDenialUnavailable = core.DecoderDenialUnavailable
POLICY_VERSION = "linux-provider-vm-decoder-socket-denial-v2"


def _admit_host():
    if sys.platform != "linux":
        raise DecoderDenialUnavailable("decoder_denial_requires_linux")
    if platform.machine().lower() != "x86_64" or struct.calcsize("P") != 8:
        raise DecoderDenialUnavailable("decoder_denial_unsupported_architecture")
    uid, euid = os.getuid(), os.geteuid()
    if uid != 0 and euid != 0:
        core._admit_host()
        return
    if uid != 0 or euid != 0:
        raise DecoderDenialUnavailable("decoder_denial_mixed_root_identity")
    try:
        status = dict(line.split(":", 1) for line in
                      Path("/proc/self/status").read_text().splitlines() if ":" in line)
        if any(int(status[key].strip(), 16) != 0 for key in
               ("CapEff", "CapPrm", "CapInh", "CapAmb", "CapBnd")):
            raise DecoderDenialUnavailable("decoder_denial_capabilities_present")
        if status["NoNewPrivs"].strip() != "1":
            raise DecoderDenialUnavailable("decoder_denial_existing_no_new_privs_required")
        if status["Seccomp"].strip() != "2" or int(status["Seccomp_filters"].strip()) < 1:
            raise DecoderDenialUnavailable("decoder_denial_existing_provider_filter_required")
        if len(os.listdir("/proc/self/task")) != 1:
            raise DecoderDenialUnavailable("decoder_denial_requires_fresh_child")
    except (OSError, ValueError, KeyError) as error:
        raise DecoderDenialUnavailable("decoder_denial_process_state_unavailable") from error


def install_denial():
    _admit_host()
    core._install_after_admission()


def main(arguments=None):
    core._run_decoder(arguments, install_denial)


if __name__ == "__main__":
    try:
        main()
    except DecoderDenialUnavailable as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
