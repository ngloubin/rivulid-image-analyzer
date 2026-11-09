import { decodeFull } from "./ImageProcessor";
export interface ImageDimensions {
  width: number;
  height: number;
}
function exifOrientation(bytes: Uint8Array, start: number, end: number) {
  try {
    if (bytes[start] === 69 && bytes[start + 1] === 120) start += 6;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      little = view.getUint16(start) === 0x4949;
    if (!little && view.getUint16(start) !== 0x4d4d) return 1;
    if (view.getUint16(start + 2, little) !== 42) return 1;
    const ifd = start + view.getUint32(start + 4, little);
    if (ifd < start || ifd + 2 > end) return 1;
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const p = ifd + 2 + 12 * i;
      if (p + 12 > end) break;
      if (view.getUint16(p, little) === 0x112) return view.getUint16(p + 8, little);
    }
  } catch {
    /* A malformed EXIF block does not invalidate a decodable image. */
  }
  return 1;
}
export function parseImageHeader(bytes: Uint8Array): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2,
      width = 0,
      height = 0,
      orientation = 1;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) return null;
      while (bytes[p] === 0xff) p++;
      const marker = bytes[p++]!;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > bytes.length) return null;
      const length = view.getUint16(p);
      if (length < 2 || p + length > bytes.length) return null;
      if (
        marker === 0xe1 &&
        bytes[p + 2] === 69 &&
        bytes[p + 3] === 120 &&
        bytes[p + 4] === 105 &&
        bytes[p + 5] === 102 &&
        bytes[p + 6] === 0 &&
        bytes[p + 7] === 0
      )
        orientation = exifOrientation(bytes, p + 2, p + length);
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      ) {
        height = view.getUint16(p + 3);
        width = view.getUint16(p + 5);
      }
      p += length;
    }
    if (width && height)
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
  }
  if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    const u24 = (p: number) => bytes[p]! + (bytes[p + 1]! << 8) + (bytes[p + 2]! << 16);
    if (kind === "VP8X") {
      // EXIF-bearing WebP falls back to the browser to respect its orientation.
      if (bytes[20]! & 8) return null;
      return { width: 1 + u24(24), height: 1 + u24(27) };
    }
    if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a)
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  }
  return null;
}
/** Reads headers instead of decoding every photo in a batch; uncommon/malformed headers fall back. */
export async function readImageDimensions(file: Blob): Promise<ImageDimensions> {
  let limit = Math.min(file.size, 65536);
  while (limit > 0) {
    const dimensions = parseImageHeader(new Uint8Array(await file.slice(0, limit).arrayBuffer()));
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) return dimensions;
    if (limit >= file.size || limit >= 1048576) break;
    limit = Math.min(file.size, limit * 2);
  }
  const image = await decodeFull(file);
  try {
    return { width: image.width, height: image.height };
  } finally {
    image.close();
  }
}
