import type { ModelConfig, ResolvedModelConfig } from "./ModelConfig";

/** All boxes use original-image pixels (or window pixels inside adapters). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type DetectionSource = "auto" | "manual";
export type ReviewStatus = "pending" | "confirmed" | "edited" | "rejected";
export interface Detection extends Box {
  id: string;
  source: DetectionSource;
  status: ReviewStatus;
  confidence?: number;
  label: string;
  classId?: number;
  provenance?: { runId: string; modelHash: string; modelVersion: string };
}
export interface RawPrediction extends Box {
  confidence: number;
  classId: number;
}
export type ExecutionProvider = "wasm" | "webgpu";
export interface TensorData {
  data: ArrayLike<number>;
  dims: readonly number[];
}
export interface ModelMetadata {
  inputs: { name: string; type: string; shape: readonly (number | string)[] }[];
  outputs: { name: string; type: string; shape: readonly (number | string)[] }[];
}
export interface PreparedInput {
  feeds: Record<string, unknown>;
  meta: unknown;
  dispose: () => void;
}
/** Adapters normalize architecture-specific outputs into WINDOW pixel boxes.
 * No UI imports adapters. Either NMS stage may be disabled in the config.
 */
export interface ModelAdapter {
  readonly name: string;
  readonly config: ResolvedModelConfig;
  preprocess(img: ImageBitmap): Promise<PreparedInput>;
  postprocess(
    outputs: Record<string, unknown>,
    meta: unknown,
    width: number,
    height: number,
  ): RawPrediction[];
}
export interface Progress {
  stage?: "inference" | "merging";
  completed: number;
  total: number;
}
export interface InferenceRecord {
  runId: string;
  startedAt: string;
  modelName: string;
  modelHash: string;
  modelVersion: string;
  config: ResolvedModelConfig;
  metadata: ModelMetadata;
  requestedProvider: ExecutionProvider;
  provider: ExecutionProvider;
  fallbackReason: string | null;
  threads: number;
  isolated: boolean;
  windows: number;
  ms: number;
}
export interface DetectionResult {
  detections: Detection[];
  ms: number;
  record: InferenceRecord;
}
export interface LoadedModel {
  name: string;
  hash: string;
  config: ResolvedModelConfig;
  metadata: ModelMetadata;
  requestedProvider: ExecutionProvider;
  provider: ExecutionProvider;
  fallbackReason: string | null;
  threads: number;
  isolated: boolean;
}
export interface CachedModel {
  model: ArrayBuffer;
  name: string;
  config: ModelConfig;
  provider: ExecutionProvider;
}

/** Stable minimum contract. Architecture-specific details belong only in adapters. */
export interface DetectionEngineContract {
  load(): Promise<void>;
  detect(image: ImageData): Promise<Detection[]>;
  dispose(): Promise<void>;
}
