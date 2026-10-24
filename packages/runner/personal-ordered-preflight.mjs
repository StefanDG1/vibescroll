import { createHash } from "node:crypto";
import { transcribeNormalizedAudio } from "./local-asr.mjs";

// A local, silent PCM probe verifies the installed pinned ASR/runtime and model
// files without downloading weights, obtaining credentials or contacting an API.
export async function checkOrderedAsr(
  asr,
  signal,
  transcribe = transcribeNormalizedAudio,
) {
  if (!asr) throw Error("PERSONAL_ASR_SETUP_REQUIRED");
  const bytes = new Uint8Array(3244),
    view = new DataView(bytes.buffer);
  const tag = (offset, text) => {
    for (let i = 0; i < text.length; i++)
      bytes[offset + i] = text.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, 3200, true);
  signal?.throwIfAborted();
  const result = await transcribe(bytes, { ...asr, signal, timeoutMs: 30000 });
  signal?.throwIfAborted();
  if (
    result.audioSha256 !== createHash("sha256").update(bytes).digest("hex") ||
    result.durationMs !== 100 ||
    !Array.isArray(result.segments) ||
    result.segments.length
  )
    throw Error("PERSONAL_ASR_PREFLIGHT_FAILED");
  return true;
}
