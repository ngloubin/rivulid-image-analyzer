import type { ExecutionProvider, ModelMetadata } from "./types";
import { getOrtRuntime } from "./OrtRuntime";

type OrtModule = typeof import("onnxruntime-web");
export async function createWithFallback<T>(
  create: (provider: ExecutionProvider) => Promise<T>,
  requested: ExecutionProvider,
) {
  try {
    return { session: await create(requested), provider: requested, fallbackReason: null };
  } catch (error) {
    if (requested !== "webgpu") throw error;
    return {
      session: await create("wasm"),
      provider: "wasm" as const,
      fallbackReason: (error as Error).message,
    };
  }
}
/** Lives in the inference Worker. No photos or model bytes are uploaded. */
export class SessionResources {
  private session: import("onnxruntime-web").InferenceSession | null = null;
  async createSession(model: ArrayBuffer, requested: ExecutionProvider) {
    await this.releaseSession();
    const ort: OrtModule = await getOrtRuntime();
    const isolated = globalThis.crossOriginIsolated === true;
    const threads = isolated
      ? Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
      : 1;
    ort.env.wasm.numThreads = threads;
    ort.env.wasm.proxy = false; // Already running in our own module Worker.
    const loaded = await createWithFallback(
      (provider) =>
        ort.InferenceSession.create(new Uint8Array(model), { executionProviders: [provider] }),
      requested,
    );
    this.session = loaded.session;
    const metadata: ModelMetadata = {
      inputs: this.session.inputMetadata.map((m) => {
        if (!m.isTensor) throw new Error("Entrada não tensorial não suportada.");
        return { name: m.name, type: m.type, shape: [...m.shape] };
      }),
      outputs: this.session.outputMetadata.map((m) => {
        if (!m.isTensor) throw new Error("Saída não tensorial não suportada.");
        return { name: m.name, type: m.type, shape: [...m.shape] };
      }),
    };
    return { ...loaded, metadata, threads, isolated };
  }
  async run(feeds: Record<string, unknown>) {
    if (!this.session) throw new Error("Sessão indisponível.");
    return this.session.run(feeds as import("onnxruntime-web").InferenceSession.FeedsType);
  }
  async releaseSession() {
    const previous = this.session;
    this.session = null;
    if (previous) await previous.release();
  }
}
