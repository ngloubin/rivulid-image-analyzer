import { letterbox, toCHW } from "./ImageProcessor";
import { nms } from "./ResultProcessor";
import type { ModelAdapter, RawPrediction } from "./types";

/**
 * YOLO11 ONNX adapter. Input size and output layout are NOT assumed: they must be
 * supplied explicitly in the model config (from the exported model's metadata).
 */
export interface YOLOConfig {
  inputName?: string;
  inputWidth?: number;
  inputHeight?: number;
  /** "channels_first": [1, 4+nc, N] (Ultralytics default); "rows": [1, N, 4+nc]. */
  outputLayout?: "channels_first" | "rows";
  numClasses?: number;
  confThreshold: number;
  iouThreshold: number;
}

type Meta = { scale: number; padX: number; padY: number };

export class YOLOAdapter implements ModelAdapter {
  readonly name = "YOLO11 (ONNX)";
  constructor(public cfg: YOLOConfig) {}

  validateConfig() {
    const c = this.cfg;
    if (!c.inputWidth || !c.inputHeight) return "Dimensões de entrada do modelo não informadas.";
    if (!c.outputLayout) return "Formato de saída do modelo não informado.";
    if (!c.numClasses) return "Número de classes não informado.";
    return null;
  }

  async preprocess(img: ImageBitmap) {
    const ort = await import("onnxruntime-web");
    const { inputWidth: w, inputHeight: h } = this.cfg as Required<YOLOConfig>;
    const { data, scale, padX, padY } = letterbox(img, w, h);
    const tensor = new ort.Tensor("float32", toCHW(data, w, h), [1, 3, h, w]);
    return { feeds: { [this.cfg.inputName ?? "images"]: tensor }, meta: { scale, padX, padY } as Meta, dispose: () => tensor.dispose() };
  }

  postprocess(outputs: Record<string, unknown>, meta: unknown, W: number, H: number): RawPrediction[] {
    const { scale, padX, padY } = meta as Meta;
    const out = Object.values(outputs)[0] as { data: Float32Array; dims: readonly number[] };
    const nc = this.cfg.numClasses!, stride = 4 + nc;
    const cf = this.cfg.outputLayout === "channels_first";
    const N = cf ? out.dims[2] : out.dims[1];
    if ((cf ? out.dims[1] : out.dims[2]) !== stride) throw new Error(`Saída inesperada ${JSON.stringify(out.dims)} para ${nc} classe(s).`);
    const at = (i: number, k: number) => (cf ? out.data[k * N + i] : out.data[i * stride + k]);
    const preds: RawPrediction[] = [];
    for (let i = 0; i < N; i++) {
      let best = 0, cls = 0;
      for (let c = 0; c < nc; c++) { const s = at(i, 4 + c); if (s > best) { best = s; cls = c; } }
      if (best < this.cfg.confThreshold) continue;
      const cx = (at(i, 0) - padX) / scale, cy = (at(i, 1) - padY) / scale;
      const bw = at(i, 2) / scale, bh = at(i, 3) / scale;
      preds.push({ x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, confidence: best, classId: cls });
    }
    void W; void H;
    return nms(preds, this.cfg.iouThreshold);
  }
}
