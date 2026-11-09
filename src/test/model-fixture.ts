import type { ModelConfig } from "@/lib/engine/ModelConfig";
import type { InferenceRecord, LoadedModel } from "@/lib/engine/types";
export const config: ModelConfig = {
  schemaVersion: 1,
  id: "test-only",
  version: "synthetic",
  adapter: "yolo",
  classes: ["ovo"],
  input: { name: "images", width: 1024, height: 1024 },
  preprocessing: {
    resize: "letterbox",
    scale: 1 / 255,
    mean: [0, 0, 0],
    std: [1, 1, 1],
    padValue: 114,
  },
  output: { name: "output0", layout: "channels_first" },
  inference: {
    candidateThreshold: 0.05,
    windowNmsIou: 0.4,
    globalNmsIou: 0.4,
    reviewMergeIou: 0.5,
    tiling: {
      enabled: true,
      tileSizes: [{ width: 512, height: 512 }],
      overlap: 0.25,
      maxWindows: 1000,
    },
  },
};
export const loaded: LoadedModel = {
  name: "synthetic.onnx",
  hash: "a".repeat(64),
  config: { ...config, input: { name: "images", width: 1024, height: 1024 } },
  metadata: {
    inputs: [{ name: "images", type: "float32", shape: [1, 3, 1024, 1024] }],
    outputs: [{ name: "output0", type: "float32", shape: [1, 5, 1] }],
  },
  requestedProvider: "wasm",
  provider: "wasm",
  fallbackReason: null,
  threads: 1,
  isolated: false,
};
export const record: InferenceRecord = {
  runId: "run-1",
  startedAt: "2026-11-07T00:00:00Z",
  modelName: loaded.name,
  modelHash: loaded.hash,
  modelVersion: config.version,
  config: loaded.config,
  metadata: loaded.metadata,
  requestedProvider: "wasm",
  provider: "wasm",
  fallbackReason: null,
  threads: 1,
  isolated: false,
  windows: 2,
  ms: 10,
};
