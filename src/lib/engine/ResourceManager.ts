/** Owns the single ONNX session, object URLs, and the one-inference-at-a-time lock. */
type OrtModule = typeof import("onnxruntime-web");

class ResourceManagerImpl {
  private ort: OrtModule | null = null;
  private session: import("onnxruntime-web").InferenceSession | null = null;
  private urls = new Set<string>();
  private busy = false;

  async loadOrt(): Promise<OrtModule> {
    // Heavy module is only fetched when a model is actually loaded.
    if (!this.ort) this.ort = await import("onnxruntime-web");
    return this.ort;
  }

  async createSession(model: ArrayBuffer, provider: "wasm" | "webgpu") {
    await this.releaseSession();
    const ort = await this.loadOrt();
    const providers = provider === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
    this.session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: providers });
    return this.session;
  }

  getSession() { return this.session; }

  async releaseSession() {
    if (this.session) { await this.session.release().catch(() => {}); this.session = null; }
  }

  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error("Já existe uma inferência em andamento.");
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }

  createObjectURL(blob: Blob) { const u = URL.createObjectURL(blob); this.urls.add(u); return u; }
  revokeObjectURL(u: string | null | undefined) { if (u && this.urls.delete(u)) URL.revokeObjectURL(u); }
}

export const ResourceManager = new ResourceManagerImpl();
