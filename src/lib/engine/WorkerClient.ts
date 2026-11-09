import type { ModelConfig } from "./ModelConfig";
import type { DetectionResult, ExecutionProvider, LoadedModel, Progress } from "./types";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol";
export interface EngineClient {
  load(
    model: ArrayBuffer,
    name: string,
    config: ModelConfig,
    provider: ExecutionProvider,
    hash: string,
  ): Promise<LoadedModel>;
  detect(
    file: Blob | ImageData,
    signal?: AbortSignal,
    onProgress?: (p: Progress) => void,
  ): Promise<DetectionResult>;
  inspect?(file: Blob, signal?: AbortSignal): Promise<Blob>;
  unload(): Promise<void>;
  dispose?(): Promise<void>;
}
export class WorkerClient implements EngineClient {
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      progress?: ((p: Progress) => void) | undefined;
    }
  >();
  private getWorker() {
    if (!this.worker) {
      if (typeof Worker === "undefined")
        throw new Error("Inferência requer Web Workers. A revisão manual continua disponível.");
      this.worker = new Worker(new URL("./inference.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data,
          p = this.pending.get(response.id);
        if (!p) return;
        if (response.kind === "progress") {
          p.progress?.(response.progress);
          return;
        }
        this.pending.delete(response.id);
        if (response.kind === "result") p.resolve(response.value);
        else {
          const error = new Error(response.message);
          error.name = response.name;
          p.reject(error);
        }
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || "Falha no Worker de inferência.");
        error.name = "WorkerError";
        for (const p of this.pending.values()) p.reject(error);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }
  private request<T>(
    payload: Omit<WorkerRequest, "id">,
    transfer: Transferable[] = [],
    signal?: AbortSignal,
    progress?: (p: Progress) => void,
  ) {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Análise cancelada.", "AbortError"));
    const id = crypto.randomUUID(),
      worker = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      const cancel = () => worker.postMessage({ id, kind: "cancel" } satisfies WorkerRequest);
      signal?.addEventListener("abort", cancel, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", cancel);
      this.pending.set(id, {
        resolve: (v) => {
          cleanup();
          resolve(v as T);
        },
        reject: (e) => {
          cleanup();
          reject(e);
        },
        progress,
      });
      try {
        worker.postMessage({ id, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }
  load(
    model: ArrayBuffer,
    name: string,
    config: ModelConfig,
    provider: ExecutionProvider,
    hash: string,
  ) {
    return this.request<LoadedModel>({ kind: "load", model, name, config, provider, hash }, [
      model,
    ]);
  }
  detect(file: Blob | ImageData, signal?: AbortSignal, progress?: (p: Progress) => void) {
    return this.request<DetectionResult>(
      { kind: "detect", ...(file instanceof Blob ? { file } : { image: file }) },
      [],
      signal,
      progress,
    );
  }
  inspect(file: Blob, signal?: AbortSignal) {
    return this.request<Blob>({ kind: "inspect", file }, [], signal);
  }
  async dispose() {
    try {
      if (this.worker) await this.unload();
    } finally {
      this.worker?.terminate();
      this.worker = null;
    }
  }
  async unload() {
    await this.request<null>({ kind: "unload" });
  }
}
