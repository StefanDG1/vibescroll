import { spawn } from "node:child_process";
import {
  mkdtemp,
  open,
  writeFile,
  unlink,
  rmdir,
  mkdir,
  realpath,
  lstat,
} from "node:fs/promises";
import { resolve, join, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
export const localWhisperPath = fileURLToPath(
  new URL("../media/local_whisper.py", import.meta.url),
);

// Only the isolated decoder's normalized audio belongs here. No URL, raw-media
// decoding, subprocess command from a source, API credential or funding fallback.
export async function transcribeNormalizedAudio(
  audio,
  { pythonPath, modelDirectory, signal, timeoutMs = 900000, privateDirectory },
) {
  signal?.throwIfAborted();
  if (
    !(audio instanceof Uint8Array) ||
    audio.byteLength < 44 ||
    audio.byteLength > 19500000 ||
    !isAbsolute(pythonPath ?? "") ||
    !isAbsolute(modelDirectory ?? "") ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 900000
  )
    throw new Error("LOCAL_ASR_INVALID_INPUT");
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA)
    throw new Error("LOCAL_ASR_UNSUPPORTED_PLATFORM");
  const base = privateDirectory
    ? resolve(privateDirectory)
    : resolve(process.env.LOCALAPPDATA, "VibeScroller", "media");
  if (
    privateDirectory &&
    !base.startsWith(resolve(process.cwd(), "private") + sep)
  )
    throw new Error("LOCAL_ASR_PRIVATE_PATH_INVALID");
  await mkdir(base, { recursive: true, mode: 0o700 });
  if (
    privateDirectory &&
    ((await realpath(base)) !== base ||
      (await lstat(base)).isSymbolicLink() ||
      (await realpath(resolve("private"))) !== resolve("private"))
  )
    throw new Error("LOCAL_ASR_PRIVATE_PATH_INVALID");
  const directory = await mkdtemp(join(base, "asr-"));
  // Verify the absolute cleanup target before removing any task files.
  if (!resolve(directory).startsWith(base + sep))
    throw new Error("LOCAL_ASR_PRIVATE_PATH_INVALID");
  const input = join(directory, "audio.wav"),
    output = join(directory, "transcript.json");
  try {
    await writeFile(input, audio, { flag: "wx", mode: 0o600 });
    signal?.throwIfAborted();
    await new Promise((done, reject) => {
      // The transcription process never receives the parent process's provider
      // secrets, OAuth state, Node options, Python path overrides or user prompt.
      const environment = Object.fromEntries(
        [
          "SystemRoot",
          "SYSTEMROOT",
          "WINDIR",
          "TEMP",
          "TMP",
          "LOCALAPPDATA",
        ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
      );
      Object.assign(environment, {
        HF_HUB_OFFLINE: "1",
        HF_HUB_DISABLE_TELEMETRY: "1",
        PYTHONNOUSERSITE: "1",
        OMP_NUM_THREADS: "4",
      });
      const child = spawn(
        pythonPath,
        [
          "-I",
          localWhisperPath,
          "--audio",
          input,
          "--model-directory",
          modelDirectory,
          "--output",
          output,
        ],
        {
          cwd: directory,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
          env: environment,
        },
      );
      let canceled = false;
      const abort = () => {
        canceled = true;
        child.kill();
      };
      const timer = setTimeout(abort, timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      const clean = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      child.once("error", () => {
        clean();
        reject(new Error("LOCAL_ASR_RUNTIME_UNAVAILABLE"));
      });
      child.once("close", (code) => {
        clean();
        if (canceled) reject(new Error("LOCAL_ASR_CANCELED"));
        else if (code !== 0) reject(new Error("LOCAL_ASR_FAILED"));
        else done();
      });
      if (signal?.aborted) abort();
    });
    signal?.throwIfAborted();
    const file = await open(output, "r");
    try {
      const bytes = Buffer.alloc(500001);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 500000) throw new Error("LOCAL_ASR_OUTPUT_LIMIT");
      return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    } finally {
      await file.close();
    }
  } finally {
    // Remove only the two known private files, never recurse into model/user data.
    await Promise.all(
      [input, output].map((path) => unlink(path).catch(() => {})),
    );
    await rmdir(directory);
  }
}
