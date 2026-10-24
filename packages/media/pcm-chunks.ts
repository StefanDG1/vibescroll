export type PcmChunk = {
  bytes: Uint8Array;
  offsetSamples: number;
  samples: number;
  offsetMs: number;
  durationMs: number;
  sampleRate: 16000;
};
const tag = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));
const writeTag = (bytes: Uint8Array, offset: number, value: string) => {
  for (let i = 0; i < 4; i++) bytes[offset + i] = value.charCodeAt(i);
};

// Accept only the actual isolated decoder's bounded PCM16 mono/16kHz RIFF WAV.
// Ancillary text is never copied into inference requests. A fact sample count,
// when present, must match the data and is rewritten for each generated chunk.
export function pcmChunks(input: Uint8Array): PcmChunk[] {
  if (input.byteLength < 44 || input.byteLength > 19_500_000)
    throw Error("INVALID_ORDERED_PCM");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (
    tag(input, 0) !== "RIFF" ||
    tag(input, 8) !== "WAVE" ||
    view.getUint32(4, true) !== input.byteLength - 8
  )
    throw Error("INVALID_ORDERED_PCM");
  let position = 12,
    format = false,
    data: Uint8Array | undefined,
    fact: number | undefined,
    count = 0;
  while (position < input.byteLength) {
    if (++count > 64 || position + 8 > input.byteLength)
      throw Error("INVALID_ORDERED_PCM");
    const name = tag(input, position),
      size = view.getUint32(position + 4, true),
      start = position + 8,
      end = start + size;
    if (end > input.byteLength || end + (size % 2) > input.byteLength)
      throw Error("INVALID_ORDERED_PCM");
    if (name === "fmt ") {
      if (
        format ||
        size !== 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        view.getUint32(start + 4, true) !== 16000 ||
        view.getUint32(start + 8, true) !== 32000 ||
        view.getUint16(start + 12, true) !== 2 ||
        view.getUint16(start + 14, true) !== 16
      )
        throw Error("INVALID_ORDERED_PCM");
      format = true;
    } else if (name === "data") {
      if (!format || data || !size || size % 2)
        throw Error("INVALID_ORDERED_PCM");
      data = input.subarray(start, end);
    } else if (name === "fact") {
      if (fact !== undefined || size !== 4) throw Error("INVALID_ORDERED_PCM");
      fact = view.getUint32(start, true);
    } else if (!["LIST", "JUNK"].includes(name))
      throw Error("INVALID_ORDERED_PCM");
    position = end + (size % 2);
  }
  if (
    !format ||
    !data ||
    position !== input.byteLength ||
    (fact !== undefined && fact !== data.byteLength / 2) ||
    data.byteLength > 19_200_000
  )
    throw Error("INVALID_ORDERED_PCM");
  const chunks: PcmChunk[] = [],
    perChunk = 16000 * 60;
  for (let offset = 0; offset < data.byteLength / 2; offset += perChunk) {
    const samples = Math.min(perChunk, data.byteLength / 2 - offset),
      header = fact === undefined ? 44 : 56;
    const bytes = new Uint8Array(header + samples * 2),
      out = new DataView(bytes.buffer);
    writeTag(bytes, 0, "RIFF");
    out.setUint32(4, bytes.byteLength - 8, true);
    writeTag(bytes, 8, "WAVE");
    writeTag(bytes, 12, "fmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, 16000, true);
    out.setUint32(28, 32000, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    if (fact !== undefined) {
      writeTag(bytes, 36, "fact");
      out.setUint32(40, 4, true);
      out.setUint32(44, samples, true);
    }
    writeTag(bytes, header - 8, "data");
    out.setUint32(header - 4, samples * 2, true);
    bytes.set(data.subarray(offset * 2, (offset + samples) * 2), header);
    chunks.push({
      bytes,
      offsetSamples: offset,
      samples,
      offsetMs: offset / 16,
      durationMs: samples / 16,
      sampleRate: 16000,
    });
  }
  if (chunks.length > 10) throw Error("ORDERED_PCM_DURATION_LIMIT");
  return chunks;
}
