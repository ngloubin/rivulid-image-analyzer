import { nms, nmsAsync, toDetections, validPrediction } from "./ResultProcessor";
import type { ModelAdapter, Progress, RawPrediction } from "./types";
import type { ModelConfig } from "./ModelConfig";

export interface WindowRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
function axisCount(length: number, size: number, overlap: number) {
  return length <= size
    ? 1
    : Math.ceil((length - size) / Math.max(1, Math.round(size * (1 - overlap)))) + 1;
}
function* positions(length: number, size: number, overlap: number) {
  const step = Math.max(1, Math.round(size * (1 - overlap))),
    last = Math.max(0, length - size);
  for (let i = 0; i < axisCount(length, size, overlap); i++) yield Math.min(last, i * step);
}
export function windowCount(
  width: number,
  height: number,
  tiling: ModelConfig["inference"]["tiling"],
) {
  if (!tiling.enabled) return 1;
  return tiling.tileSizes.reduce(
    (n, s) =>
      n +
      axisCount(width, Math.min(width, s.width), tiling.overlap) *
        axisCount(height, Math.min(height, s.height), tiling.overlap),
    0,
  );
}
export function* windows(
  width: number,
  height: number,
  tiling: ModelConfig["inference"]["tiling"],
): Generator<WindowRegion> {
  if (!tiling.enabled) {
    yield { x: 0, y: 0, width, height };
    return;
  }
  for (const size of tiling.tileSizes) {
    const w = Math.min(width, size.width),
      h = Math.min(height, size.height);
    for (const y of positions(height, h, tiling.overlap))
      for (const x of positions(width, w, tiling.overlap)) yield { x, y, width: w, height: h };
  }
}
export function cropWindow(image: ImageBitmap, w: WindowRegion): ImageBitmap {
  const canvas = new OffscreenCanvas(w.width, w.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Falha ao criar janela.");
  ctx.drawImage(image, w.x, w.y, w.width, w.height, 0, 0, w.width, w.height);
  return canvas.transferToImageBitmap();
}
export interface PipelineOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  crop?: (image: ImageBitmap, window: WindowRegion) => ImageBitmap;
}
export async function runPipeline(
  image: ImageBitmap,
  adapter: ModelAdapter,
  run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>>,
  options: PipelineOptions = {},
) {
  const cfg = adapter.config.inference,
    total = windowCount(image.width, image.height, cfg.tiling);
  if (total > cfg.tiling.maxWindows)
    throw new Error(
      `A imagem exige ${total} janelas, acima de maxWindows=${cfg.tiling.maxWindows}. Ajuste o JSON do modelo.`,
    );
  const predictions: RawPrediction[] = [];
  let completed = 0;
  const check = () => {
    if (options.signal?.aborted) throw new DOMException("Análise cancelada.", "AbortError");
  };
  options.onProgress?.({ completed, total, stage: "inference" });
  for (const region of windows(image.width, image.height, cfg.tiling)) {
    check();
    const tile = cfg.tiling.enabled ? (options.crop ?? cropWindow)(image, region) : image;
    try {
      const prepared = await adapter.preprocess(tile);
      try {
        check();
        const outputs = await run(prepared.feeds);
        try {
          check();
          const raw = adapter
            .postprocess(outputs, prepared.meta, tile.width, tile.height)
            .filter((p) => validPrediction(p) && p.confidence >= cfg.candidateThreshold);
          const local = cfg.windowNmsIou === null ? raw : nms(raw, cfg.windowNmsIou);
          for (const p of local) {
            predictions.push({ ...p, x: p.x + region.x, y: p.y + region.y });
          }
        } finally {
          for (const t of Object.values(outputs)) (t as { dispose?: () => void }).dispose?.();
        }
      } finally {
        prepared.dispose();
      }
    } finally {
      if (tile !== image) tile.close();
    }
    options.onProgress?.({ completed: ++completed, total, stage: "inference" });
    // Allow cancel messages through even if a fake or very fast backend resolves synchronously.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  check();
  options.onProgress?.({ completed, total, stage: "merging" });
  const merged =
    cfg.globalNmsIou === null
      ? predictions
      : await nmsAsync(predictions, cfg.globalNmsIou, options.signal);
  return {
    detections: toDetections(merged, image.width, image.height, adapter.config.classes),
    windows: total,
  };
}
