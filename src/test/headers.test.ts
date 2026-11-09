import { describe, it, expect } from "vitest";
import { parseImageHeader } from "@/lib/engine/ImageHeaders";
describe("image header sizes", () => {
  it("respects JPEG EXIF orientation even when a later APP1 contains XMP", () => {
    const exif = new Uint8Array([
      69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const bytes = new Uint8Array([
      255,
      216,
      255,
      225,
      0,
      exif.length + 2,
      ...exif,
      255,
      225,
      0,
      5,
      88,
      77,
      80,
      255,
      192,
      0,
      11,
      8,
      11,
      184,
      15,
      160,
      3,
      1,
      0,
      0,
      255,
      218,
      0,
      2,
    ]);
    expect(parseImageHeader(bytes)).toEqual({ width: 3000, height: 4000 });
  });

  it("reads PNG dimensions without decoding pixels", () => {
    const bytes = new Uint8Array(24),
      v = new DataView(bytes.buffer);
    v.setUint32(0, 0x89504e47);
    v.setUint32(4, 0x0d0a1a0a);
    v.setUint32(16, 4000);
    v.setUint32(20, 3000);
    expect(parseImageHeader(bytes)).toEqual({ width: 4000, height: 3000 });
  });
  it("reads JPEG SOF dimensions", () => {
    const bytes = new Uint8Array([
      255, 216, 255, 192, 0, 11, 8, 11, 184, 15, 160, 3, 1, 0, 0, 255, 218, 0, 2,
    ]);
    expect(parseImageHeader(bytes)).toEqual({ width: 4000, height: 3000 });
  });
  it("rejects truncated headers", () => {
    expect(parseImageHeader(new Uint8Array([255, 216, 255]))).toBeNull();
  });
});
