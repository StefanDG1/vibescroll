// Read dimensions without decoding attacker-controlled pixels or allocating by size.
export function jpegDimensions(bytes: Uint8Array) {
  if (
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw Error("INVALID_JPEG");
  for (let offset = 2; offset + 3 < bytes.length;) {
    if (bytes[offset++] !== 255) throw Error("INVALID_JPEG");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw Error("INVALID_JPEG");
    if (marker === 192 || marker === 194) {
      if (length < 8 || bytes[offset + 2] !== 8) throw Error("INVALID_JPEG");
      const height = bytes[offset + 3] * 256 + bytes[offset + 4];
      const width = bytes[offset + 5] * 256 + bytes[offset + 6];
      if (!height || !width || height > 960 || width > 960)
        throw Error("INVALID_JPEG");
      return { width, height };
    }
    offset += length;
  }
  throw Error("INVALID_JPEG");
}
