import { inverseBox, prepareInput, type Transform } from "./ImageProcessor";
import { readTensor } from "./YOLOAdapter";
import type { ResolvedModelConfig } from "./ModelConfig";
import type { ModelAdapter, RawPrediction } from "./types";

/** Explicit [1,Q,4] boxes + [1,Q,C] scores contract. This is not a claim that an
 * uninspected RF-DETR export uses this contract; verify its ONNX outputs first.
 */
export class SetDetectorAdapter implements ModelAdapter {
  readonly name = "Detector por conjunto (ONNX)";
  constructor(public readonly config: ResolvedModelConfig) {}
  preprocess(img: ImageBitmap) {
    return prepareInput(img, this.config);
  }
  postprocess(outputs: Record<string, unknown>, meta: unknown): RawPrediction[] {
    const cfg = this.config,
      o = cfg.output;
    const boxes = readTensor(outputs, o.boxes!),
      scores = readTensor(outputs, o.scores!);
    const nc = cfg.classes.length + (o.backgroundIndex === undefined ? 0 : 1),
      Q = boxes.dims[1]!;
    if (
      boxes.dims.length !== 3 ||
      boxes.dims[0] !== 1 ||
      boxes.dims[2] !== 4 ||
      scores.dims.length !== 3 ||
      scores.dims[0] !== 1 ||
      scores.dims[1] !== Q ||
      scores.dims[2] !== nc
    )
      throw new Error("Saídas por conjunto divergem de [1,Q,4] / [1,Q,C].");
    const result: RawPrediction[] = [];
    for (let i = 0; i < Q; i++) {
      const raw = Array.from({ length: nc }, (_, c) => scores.data[i * nc + c]!);
      const max = Math.max(...raw);
      const exp = o.activation === "softmax" ? raw.map((v) => Math.exp(v - max)) : null;
      const denom = exp?.reduce((a, b) => a + b, 0) ?? 1;
      const probabilities = raw.map((v, c) =>
        o.activation === "softmax"
          ? exp![c]! / denom
          : o.activation === "sigmoid"
            ? 1 / (1 + Math.exp(-v))
            : v,
      );
      let best = 0;
      for (let c = 1; c < nc; c++) if (probabilities[c]! > probabilities[best]!) best = c;
      const confidence = probabilities[best]!;
      if (best === o.backgroundIndex || confidence < cfg.inference.candidateThreshold) continue;
      const classId = o.backgroundIndex !== undefined && best > o.backgroundIndex ? best - 1 : best;
      let [a, b, c, d] = Array.from({ length: 4 }, (_, k) => boxes.data[i * 4 + k]!) as [
        number,
        number,
        number,
        number,
      ];
      if (o.coordinateSpace === "normalized") {
        a *= cfg.input.width;
        c *= cfg.input.width;
        b *= cfg.input.height;
        d *= cfg.input.height;
      }
      const xywh =
        o.boxFormat === "xyxy"
          ? { cx: (a + c) / 2, cy: (b + d) / 2, w: c - a, h: d - b }
          : { cx: a, cy: b, w: c, h: d };
      result.push({
        ...inverseBox(xywh.cx, xywh.cy, xywh.w, xywh.h, meta as Transform),
        confidence,
        classId,
      });
    }
    return result;
  }
}
