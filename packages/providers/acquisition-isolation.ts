import type { JobSandbox } from "./sandbox";
import { PolicyError } from "../policy";

export async function hardenAcquisition(sandbox: JobSandbox) {
  try {
    // Guest commands keep an empty network namespace. Only the trusted Unix
    // broker can resolve and connect to reviewed public HTTPS destinations.
    await sandbox.configurePublicDownload();
    const result = await sandbox.commands.run(
      `python3 - <<'PY'
import os,pathlib,socket
assert os.getuid()==1001
assert 'NoNewPrivs:\\t1' in pathlib.Path('/proc/self/status').read_text()
for host,port in [('169.254.169.254',80),('1.1.1.1',443),('127.0.0.1',49983)]:
 try:
  socket.create_connection((host,port),timeout=1)
 except OSError: pass
 else: raise AssertionError('direct network access')
with socket.create_connection(('127.0.0.1',47891),timeout=3) as peer:
 peer.sendall(b'CONNECT 169.254.169.254:443 HTTP/1.1\\r\\n\\r\\n')
 assert b'403 Forbidden' in peer.recv(1024)
PY`,
      { user: "user", timeoutMs: 10000 },
    );
    if (result.exitCode !== 0) throw Error();
  } catch (error) {
    await sandbox.kill();
    if (error instanceof PolicyError) throw error;
    throw new PolicyError(
      "ACQUISITION_ISOLATION_FAILED",
      "Link retrieval isolation could not be established. Execution blocked.",
    );
  }
}
