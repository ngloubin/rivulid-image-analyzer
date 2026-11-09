import type { ModelConfig } from "./ModelConfig";
import type { ExecutionProvider, Progress } from "./types";
export interface WorkerRequest {
  id: string;
  kind: "load" | "detect" | "inspect" | "unload" | "cancel";
  model?: ArrayBuffer;
  name?: string;
  config?: ModelConfig;
  provider?: ExecutionProvider;
  hash?: string;
  file?: Blob;
  image?: ImageData;
}
export type WorkerResponse =
  | { id: string; kind: "progress"; progress: Progress }
  | { id: string; kind: "result"; value: unknown }
  | { id: string; kind: "error"; message: string; name: string };
