import { decodeFull } from "./ImageProcessor";
import { ResourceManager } from "./ResourceManager";
import { toDetections } from "./ResultProcessor";
import type { Detection, ExecutionProvider, ModelAdapter } from "./types";

export type EngineState =
  | { kind: "none" }
  | { kind: "loading"; name: string }
  | { kind: "ready"; name: string; provider: ExecutionProvider }
  | { kind: "error"; message: string };

/** Model-agnostic facade. Swap the adapter (YOLO11 → RF-DETR) without touching the UI. */
export class DetectionEngine {
  private adapter: ModelAdapter | null = null;
  state: EngineState = { kind: "none" };

  async load(model: ArrayBuffer, name: string, adapter: ModelAdapter, provider: ExecutionProvider) {
    const err = adapter.validateConfig();
    if (err) throw new Error(err);
    this.state = { kind: "loading", name };
    try {
      await ResourceManager.createSession(model, provider);
      this.adapter = adapter;
      this.state = { kind: "ready", name, provider };
    } catch (e) {
      this.adapter = null;
      this.state = { kind: "error", message: (e as Error).message };
      throw e;
    }
  }

  isReady() { return this.state.kind === "ready" && !!this.adapter && !!ResourceManager.getSession(); }

  async unload() { await ResourceManager.releaseSession(); this.adapter = null; this.state = { kind: "none" }; }

  async detect(file: Blob): Promise<{ detections: Detection[]; ms: number }> {
    if (!this.isReady()) throw new Error("Nenhum modelo de IA carregado.");
    return ResourceManager.exclusive(async () => {
      const t0 = performance.now();
      const bmp = await decodeFull(file);
      const { feeds, meta, dispose } = await this.adapter!.preprocess(bmp);
      try {
        const out = await ResourceManager.getSession()!.run(feeds as never);
        const raw = this.adapter!.postprocess(out, meta, bmp.width, bmp.height);
        for (const t of Object.values(out)) (t as { dispose?: () => void }).dispose?.();
        return { detections: toDetections(raw, bmp.width, bmp.height), ms: performance.now() - t0 };
      } finally { dispose(); bmp.close(); }
    });
  }
}

export const engine = new DetectionEngine();
