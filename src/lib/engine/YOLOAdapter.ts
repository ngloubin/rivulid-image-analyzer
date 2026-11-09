import { inverseBox, prepareInput, type Transform } from "./ImageProcessor";
import type { ResolvedModelConfig } from "./ModelConfig";
import type { ModelAdapter, RawPrediction, TensorData } from "./types";

export function readTensor(outputs: Record<string, unknown>, name: string): TensorData {
  const t = outputs[name] as TensorData | undefined;
  if (
    !t ||
    !Array.isArray(t.dims) ||
    !t.data ||
    t.data.length !== t.dims.reduce((a, b) => a * b, 1)
  )
    throw new Error("Tensor ausente/inválido: " + name);
  return t;
}
/** YOLO dense xywh + class probabilities, with no objectness column. */
export class YOLOAdapter implements ModelAdapter {
  readonly name = "YOLO (ONNX)";
  constructor(public readonly config: ResolvedModelConfig) {}
  preprocess(img: ImageBitmap) {
    return prepareInput(img, this.config);
  }
  postprocess(outputs: Record<string, unknown>, meta: unknown): RawPrediction[] {
    const out = readTensor(outputs, this.config.output.name!);
    const nc = this.config.classes.length,
      stride = 4 + nc,
      cf = this.config.output.layout === "channels_first";
    if (out.dims.length !== 3 || out.dims[0] !== 1 || (cf ? out.dims[1] : out.dims[2]) !== stride)
      throw new Error("Formato de saída YOLO diverge da configuração.");
    const N = (cf ? out.dims[2] : out.dims[1])!;
    const at = (i: number, k: number) => out.data[cf ? k * N + i : i * stride + k]!;
    const preds: RawPrediction[] = [];
    for (let i = 0; i < N; i++) {
      let confidence = -Infinity,
        classId = 0;
      for (let c = 0; c < nc; c++)
        if (at(i, 4 + c) > confidence) {
          confidence = at(i, 4 + c);
          classId = c;
        }
      if (confidence < this.config.inference.candidateThreshold) continue;
      preds.push({
        ...inverseBox(at(i, 0), at(i, 1), at(i, 2), at(i, 3), meta as Transform),
        confidence,
        classId,
      });
    }
    return preds;
  }
}
