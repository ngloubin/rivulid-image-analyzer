import type { ResolvedModelConfig } from "./ModelConfig";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
export function validateImageFile(f: File): string | null {
  if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.test(f.name))
    return `Formato não suportado: ${f.name}. Use JPG, PNG ou WebP.`;
  return f.size === 0 ? `Arquivo vazio: ${f.name}` : null;
}
export function decodeFull(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}
export interface Transform {
  scaleX: number;
  scaleY: number;
  padX: number;
  padY: number;
}
export function resizeGeometry(
  width: number,
  height: number,
  tw: number,
  th: number,
  mode: "letterbox" | "stretch",
) {
  if (mode === "stretch")
    return { nw: tw, nh: th, scaleX: tw / width, scaleY: th / height, padX: 0, padY: 0 };
  const scale = Math.min(tw / width, th / height);
  const nw = Math.max(1, Math.round(width * scale)),
    nh = Math.max(1, Math.round(height * scale));
  // Ultralytics' integer left/top padding. Browser interpolation still needs a parity check.
  return {
    nw,
    nh,
    scaleX: scale,
    scaleY: scale,
    padX: Math.max(0, Math.round((tw - nw) / 2 - 0.1)),
    padY: Math.max(0, Math.round((th - nh) / 2 - 0.1)),
  };
}
export function letterbox(img: ImageBitmap, tw: number, th: number, padValue = 114) {
  return resizePixels(img, tw, th, "letterbox", padValue);
}
export function resizePixels(
  img: ImageBitmap,
  tw: number,
  th: number,
  mode: "letterbox" | "stretch",
  padValue: number,
) {
  if (typeof OffscreenCanvas === "undefined")
    throw new Error(
      "Este navegador não oferece OffscreenCanvas no Worker. A revisão manual continua disponível.",
    );
  const g = resizeGeometry(img.width, img.height, tw, th, mode);
  const canvas = new OffscreenCanvas(tw, th),
    ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível criar a superfície de pré-processamento.");
  ctx.fillStyle = `rgb(${padValue},${padValue},${padValue})`;
  ctx.fillRect(0, 0, tw, th);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.drawImage(img, g.padX, g.padY, g.nw, g.nh);
  const data = ctx.getImageData(0, 0, tw, th).data;
  canvas.width = 0;
  canvas.height = 0;
  return { data, ...g, scale: g.scaleX };
}
export function toCHW(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  normalization = {
    scale: 1 / 255,
    mean: [0, 0, 0] as readonly number[],
    std: [1, 1, 1] as readonly number[],
  },
) {
  const n = w * h,
    out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++)
      out[c * n + i] =
        (rgba[4 * i + c]! * normalization.scale - normalization.mean[c]!) / normalization.std[c]!;
  return out;
}
export function preparePixels(img: ImageBitmap, cfg: ResolvedModelConfig) {
  const { width: w, height: h } = cfg.input,
    c = cfg.preprocessing;
  const resized = resizePixels(img, w, h, c.resize, c.padValue);
  return {
    data: toCHW(resized.data, w, h, c),
    meta: {
      scaleX: resized.scaleX,
      scaleY: resized.scaleY,
      padX: resized.padX,
      padY: resized.padY,
    } as Transform,
  };
}
export async function prepareInput(img: ImageBitmap, cfg: ResolvedModelConfig) {
  const { Tensor } = await import("onnxruntime-web/webgpu");
  const { data, meta } = preparePixels(img, cfg);
  const tensor = new Tensor("float32", data, [1, 3, cfg.input.height, cfg.input.width]);
  return { feeds: { [cfg.input.name]: tensor }, meta, dispose: () => tensor.dispose() };
}
export function inverseBox(cx: number, cy: number, w: number, h: number, t: Transform) {
  return {
    x: (cx - w / 2 - t.padX) / t.scaleX,
    y: (cy - h / 2 - t.padY) / t.scaleY,
    w: w / t.scaleX,
    h: h / t.scaleY,
  };
}
