/** Box in ORIGINAL image pixel coordinates (top-left origin). */
export interface Box { x: number; y: number; w: number; h: number }

export type DetectionSource = "auto" | "manual";
export type ReviewStatus = "pending" | "confirmed" | "edited" | "rejected";

export interface Detection extends Box {
  id: string;
  source: DetectionSource;
  status: ReviewStatus;
  /** Only present for model predictions. */
  confidence?: number;
  label: string;
}

export interface RawPrediction extends Box { confidence: number; classId: number }

export type ExecutionProvider = "wasm" | "webgpu";

/** Model-specific adapter. Pre/post-processing live here, never in the UI. */
export interface ModelAdapter {
  readonly name: string;
  /** Validates that the adapter has everything it needs (input size, output layout...). */
  validateConfig(): string | null;
  preprocess(img: ImageBitmap): Promise<{ feeds: Record<string, unknown>; meta: unknown; dispose: () => void }>;
  postprocess(outputs: Record<string, unknown>, meta: unknown, imgW: number, imgH: number): RawPrediction[];
}
