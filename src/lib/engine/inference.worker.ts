import { paritySnapshot } from "./ParityHarness";
import { parseModelConfig, resolveModelConfig } from "./ModelConfig";
import { SessionResources } from "./ResourceManager";
import { decodeFull } from "./ImageProcessor";
import { runPipeline } from "./InferencePipeline";
import { YOLOAdapter } from "./YOLOAdapter";
import { SetDetectorAdapter } from "./SetDetectorAdapter";
import type { LoadedModel, ModelAdapter, InferenceRecord } from "./types";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol";

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
};
const resources = new SessionResources();
let adapter: ModelAdapter | null = null,
  loaded: LoadedModel | null = null;
let active: { id: string; controller: AbortController } | null = null;
async function handle(request: WorkerRequest) {
  if (request.kind === "cancel") {
    if (active?.id === request.id) active.controller.abort();
    return;
  }
  if (active) {
    scope.postMessage({
      id: request.id,
      kind: "error",
      name: "Error",
      message: "Já existe uma operação no Worker.",
    });
    return;
  }
  active = { id: request.id, controller: new AbortController() };
  try {
    let value: unknown;
    if (request.kind === "load") {
      loaded = null;
      adapter = null;
      const c = parseModelConfig(request.config);
      try {
        const runtime = await resources.createSession(request.model!, request.provider!);
        const config = resolveModelConfig(c, runtime.metadata);
        adapter =
          config.adapter === "yolo" ? new YOLOAdapter(config) : new SetDetectorAdapter(config);
        loaded = {
          name: request.name!,
          hash: request.hash!,
          config,
          metadata: runtime.metadata,
          provider: runtime.provider,
          requestedProvider: request.provider!,
          fallbackReason: runtime.fallbackReason,
          threads: runtime.threads,
          isolated: runtime.isolated,
        };
        value = loaded;
      } catch (error) {
        await resources.releaseSession().catch(() => {});
        throw error;
      }
    } else if (request.kind === "unload") {
      await resources.releaseSession();
      loaded = null;
      adapter = null;
      value = null;
    } else if (request.kind === "inspect") {
      if (!adapter || !loaded) throw new Error("Nenhum modelo carregado.");
      const image = request.image
        ? await createImageBitmap(request.image)
        : await decodeFull(request.file!);
      try {
        value = await paritySnapshot(
          image,
          adapter,
          loaded,
          (feeds) => resources.run(feeds),
          active.controller.signal,
        );
      } finally {
        image.close();
      }
    } else {
      if (!adapter || !loaded) throw new Error("Nenhum modelo de IA carregado.");
      const start = performance.now(),
        startedAt = new Date().toISOString(),
        runId = crypto.randomUUID();
      const image = request.image
        ? await createImageBitmap(request.image)
        : await decodeFull(request.file!);
      try {
        const result = await runPipeline(image, adapter, (feeds) => resources.run(feeds), {
          signal: active.controller.signal,
          onProgress: (progress) =>
            scope.postMessage({ id: request.id, kind: "progress", progress }),
        });
        const ms = performance.now() - start;
        const record: InferenceRecord = {
          runId,
          startedAt,
          modelName: loaded.name,
          modelHash: loaded.hash,
          modelVersion: loaded.config.version,
          config: loaded.config,
          metadata: loaded.metadata,
          requestedProvider: loaded.requestedProvider,
          provider: loaded.provider,
          fallbackReason: loaded.fallbackReason,
          threads: loaded.threads,
          isolated: loaded.isolated,
          windows: result.windows,
          ms,
        };
        value = {
          ms,
          record,
          detections: result.detections.map((d) => ({
            ...d,
            provenance: { runId, modelHash: loaded!.hash, modelVersion: loaded!.config.version },
          })),
        };
      } finally {
        image.close();
      }
    }
    scope.postMessage({ id: request.id, kind: "result", value });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      kind: "error",
      message: (error as Error).message,
      name: (error as Error).name,
    });
  } finally {
    active = null;
  }
}
scope.onmessage = (e) => {
  void handle(e.data);
};
