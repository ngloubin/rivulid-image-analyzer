export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

export function validateImageFile(f: File): string | null {
  if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.test(f.name)) return `Formato não suportado: ${f.name}. Use JPG, PNG ou WebP.`;
  if (f.size === 0) return `Arquivo vazio: ${f.name}`;
  return null;
}

/** Decodes at full original resolution (no downscaling). Caller must close() the bitmap. */
export async function decodeFull(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

/** Letterbox resize into a target size; returns scale/pad so boxes can be mapped back. */
export function letterbox(img: ImageBitmap, tw: number, th: number) {
  const scale = Math.min(tw / img.width, th / img.height);
  const nw = Math.round(img.width * scale), nh = Math.round(img.height * scale);
  const padX = (tw - nw) / 2, padY = (th - nh) / 2;
  const c = new OffscreenCanvas(tw, th);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(img, padX, padY, nw, nh);
  const data = ctx.getImageData(0, 0, tw, th).data;
  return { data, scale, padX, padY };
}

/** RGBA → CHW float32 normalized [0,1]. */
export function toCHW(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4]! / 255; out[n + i] = rgba[i * 4 + 1]! / 255; out[2 * n + i] = rgba[i * 4 + 2]! / 255;
  }
  return out;
}
