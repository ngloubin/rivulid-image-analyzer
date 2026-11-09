import { parseModelConfig } from "./ModelConfig";
import { modelStore, type ModelRepository } from "./ModelStore";
import { WorkerClient, type EngineClient } from "./WorkerClient";
import { BUNDLED_MODEL } from "./BundledModel";
import { downloadBinary, sha256 } from "./HostedAssets";
import type { ModelConfig } from "./ModelConfig";
import { readImageDimensions } from "./ImageHeaders";
import { validateImageFile } from "./ImageProcessor";
import { counts, mergeReanalysis, numberDetections, visibleDetections } from "./ResultProcessor";
import type {
  Detection,
  DetectionEngineContract,
  DetectionResult,
  ExecutionProvider,
  LoadedModel,
  Progress,
} from "./types";

export type EngineState =
  | { kind: "none" }
  | { kind: "loading"; name: string }
  | ({ kind: "ready"; cacheWarning: string | null } & LoadedModel)
  | { kind: "error"; message: string };
const EMPTY: EngineState = { kind: "none" };
export class DetectionEngine implements DetectionEngineContract {
  private state: EngineState = EMPTY;
  private listeners = new Set<() => void>();
  private busy = false;
  private restored = false;
  private restoration: Promise<void> | null = null;
  constructor(
    private client: EngineClient = new WorkerClient(),
    private repository: ModelRepository = modelStore,
  ) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => EMPTY;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: EngineState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private async exclusive<T>(fn: () => Promise<T>) {
    if (this.busy) throw new Error("Já existe uma operação de modelo/análise em andamento.");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }
  readonly bundledModelName = BUNDLED_MODEL.label;
  private async activate(
    model: ArrayBuffer,
    name: string,
    config: ModelConfig,
    provider: ExecutionProvider,
  ) {
    const hash = await sha256(model);
    if (config.sha256 && config.sha256.toLowerCase() !== hash)
      throw new Error("SHA-256 do ONNX diverge do JSON. Escolha o par correto de arquivos.");
    config.sha256 = hash;
    const loaded = await this.client.load(model.slice(0), name, config, provider, hash);
    let cacheWarning: string | null = null;
    try {
      await this.repository.put({ model, name, config, provider });
    } catch (error) {
      cacheWarning =
        "Modelo ativo, mas não foi possível salvá-lo neste navegador: " + (error as Error).message;
    }
    this.publish({ kind: "ready", ...loaded, cacheWarning });
  }
  async loadBundled(provider: ExecutionProvider = "wasm") {
    return this.exclusive(async () => {
      this.restored = true;
      this.publish({ kind: "loading", name: BUNDLED_MODEL.label });
      try {
        const base = `${import.meta.env.BASE_URL}${BUNDLED_MODEL.base}`;
        const response = await fetch(base + BUNDLED_MODEL.config);
        if (!response.ok)
          throw new Error(`Configuração do modelo indisponível (HTTP ${response.status}).`);
        const config = parseModelConfig(await response.json());
        if (config.sha256 !== BUNDLED_MODEL.sha256)
          throw new Error("A configuração publicada não corresponde ao modelo incluído.");
        const model = await downloadBinary(base + BUNDLED_MODEL.binary, BUNDLED_MODEL);
        await this.activate(model, BUNDLED_MODEL.name, config, provider);
      } catch (error) {
        await this.client.unload().catch(() => {});
        this.publish({ kind: "error", message: (error as Error).message });
        throw error;
      }
    });
  }
  async load(): Promise<void>;
  async load(modelFile: File, configFile: File, provider: ExecutionProvider): Promise<void>;
  async load(
    modelFile?: File,
    configFile?: File,
    provider: ExecutionProvider = "wasm",
  ): Promise<void> {
    if (!modelFile && !configFile) {
      if (this.isReady()) return;
      return this.restore(this.state.kind !== "loading");
    }
    if (!modelFile || !configFile)
      throw new Error("Escolha modelo ONNX e configuração JSON juntos.");
    return this.exclusive(async () => {
      this.restored = true;
      this.publish({ kind: "loading", name: modelFile.name });
      try {
        const config = parseModelConfig(JSON.parse(await configFile.text()));
        const model = await modelFile.arrayBuffer();
        await this.activate(model, modelFile.name, config, provider);
      } catch (error) {
        await this.client.unload().catch(() => {});
        this.publish({ kind: "error", message: (error as Error).message });
        throw error;
      }
    });
  }
  restore(force = false) {
    if (this.restored && !force) return this.restoration ?? Promise.resolve();
    this.restored = true;
    this.restoration = this.exclusive(async () => {
      try {
        const cached = await this.repository.get();
        if (!cached) return;
        this.publish({ kind: "loading", name: cached.name });
        const config = parseModelConfig(cached.config);
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", cached.model)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (config.sha256 && config.sha256.toLowerCase() !== hash)
          throw new Error("Modelo armazenado falhou na verificação SHA-256.");
        const loaded = await this.client.load(
          cached.model,
          cached.name,
          config,
          cached.provider,
          hash,
        );
        this.publish({ kind: "ready", ...loaded, cacheWarning: null });
      } catch (error) {
        await this.client.unload().catch(() => {});
        this.publish({
          kind: "error",
          message: "Falha ao restaurar modelo: " + (error as Error).message,
        });
      }
    });
    return this.restoration;
  }
  isReady() {
    return this.state.kind === "ready";
  }
  async unload(forget = false) {
    await this.exclusive(async () => {
      try {
        if (this.client.dispose) await this.client.dispose();
        else await this.client.unload();
      } finally {
        this.publish(EMPTY);
      }
      if (forget) await this.repository.clear();
    });
  }
  async detect(image: ImageData): Promise<Detection[]>;
  async detect(
    file: Blob,
    options?: { signal?: AbortSignal; onProgress?: (p: Progress) => void },
  ): Promise<DetectionResult>;
  async detect(
    image: Blob | ImageData,
    options: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
  ): Promise<DetectionResult | Detection[]> {
    if (!this.isReady()) throw new Error("Nenhum modelo de IA carregado.");
    let result: DetectionResult;
    try {
      result = await this.exclusive(() =>
        this.client.detect(image, options.signal, options.onProgress),
      );
    } catch (error) {
      if ((error as Error).name === "WorkerError")
        this.publish({ kind: "error", message: (error as Error).message });
      throw error;
    }
    return image instanceof Blob ? result : result.detections;
  }
  async dispose(): Promise<void> {
    await this.unload();
  }
  async inspect(file: Blob, signal?: AbortSignal) {
    if (!this.isReady() || !this.client.inspect)
      throw new Error("Modelo não disponível para diagnóstico.");
    return this.exclusive(() => this.client.inspect!(file, signal));
  }
  validateImageFile = validateImageFile;
  imageInfo = readImageDimensions;
  counts = counts;
  numberDetections = numberDetections;
  visibleDetections = visibleDetections;
  mergeReanalysis(previous: Detection[], incoming: Detection[], threshold: number) {
    return mergeReanalysis(previous, incoming, threshold);
  }
  createObjectURL(blob: Blob) {
    return URL.createObjectURL(blob);
  }
  revokeObjectURL(url: string) {
    URL.revokeObjectURL(url);
  }
}
export const engine = new DetectionEngine();
