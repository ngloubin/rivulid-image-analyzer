import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { DetectionEngine } from "@/lib/engine/DetectionEngine";
import { createWithFallback } from "@/lib/engine/ResourceManager";
import type { EngineClient } from "@/lib/engine/WorkerClient";
import type { ModelRepository } from "@/lib/engine/ModelStore";
import type { CachedModel, DetectionResult } from "@/lib/engine/types";
import { config, loaded, record } from "./model-fixture";
function setup() {
  let saved: CachedModel | null = null;
  const repository: ModelRepository = {
    get: vi.fn(async () => saved),
    put: vi.fn(async (m) => {
      saved = m;
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
  };
  const client: EngineClient = {
    load: vi.fn(async (_model, name, cfg, provider, hash) => ({
      ...loaded,
      name,
      hash,
      provider,
      config: { ...cfg, input: loaded.config.input },
    })),
    unload: vi.fn(async () => {}),
    detect: vi.fn(async () => ({ detections: [], ms: 10, record })),
  };
  return { client, repository, engine: new DetectionEngine(client, repository) };
}
function files() {
  const model = new File(["model-bytes"], "model.onnx"),
    json = new File([JSON.stringify(config)], "model.json");
  Object.defineProperty(model, "arrayBuffer", {
    value: async () => new TextEncoder().encode("model-bytes").buffer,
  });
  Object.defineProperty(json, "text", {
    value: async () => JSON.stringify(config),
    configurable: true,
  });
  return { model, json };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe("engine facade lifecycle", () => {
  it("fails clearly on a missing hosted config and can still load a local model", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(s.engine.loadBundled()).rejects.toThrow("HTTP 404");
    expect(s.client.load).not.toHaveBeenCalled();
    expect(s.engine.getSnapshot().kind).toBe("error");
    const f = files();
    await s.engine.load(f.model, f.json, "wasm");
    expect(s.engine.isReady()).toBe(true);
  });
  it("refuses a published config for a different model before downloading model bytes", async () => {
    const s = setup();
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...config, sha256: "0".repeat(64) }),
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(s.engine.loadBundled()).rejects.toThrow("não corresponde");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(s.client.load).not.toHaveBeenCalled();
    expect(s.repository.put).not.toHaveBeenCalled();
  });
  it("does not report a ready model after cache deletion fails", async () => {
    const s = setup(),
      f = files();
    await s.engine.load(f.model, f.json, "wasm");
    s.repository.clear = vi.fn(async () => {
      throw new Error("storage denied");
    });
    await expect(s.engine.unload(true)).rejects.toThrow("storage denied");
    expect(s.engine.isReady()).toBe(false);
  });

  it("satisfies the stable load/detect(ImageData)/dispose contract", async () => {
    const s = setup(),
      f = files();
    await s.engine.load(f.model, f.json, "wasm");
    const api: import("@/lib/engine/types").DetectionEngineContract = s.engine;
    await api.load();
    const image = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
      colorSpace: "srgb",
    } as ImageData;
    const detections: import("@/lib/engine/types").Detection[] = await api.detect(image);
    expect(detections).toEqual([]);
    await api.dispose();
    expect(s.engine.isReady()).toBe(false);
    await api.load();
    expect(s.engine.isReady()).toBe(true);
  });

  it("hashes, persists and restores a model without UI-specific adapter code", async () => {
    const s = setup(),
      f = files(),
      notify = vi.fn();
    s.engine.subscribe(notify);
    await s.engine.load(f.model, f.json, "wasm");
    expect(s.engine.isReady()).toBe(true);
    expect(s.repository.put).toHaveBeenCalledTimes(1);
    const state = s.engine.getSnapshot();
    expect(state.kind === "ready" && state.hash).toMatch(/^[a-f0-9]{64}$/);
    const remounted = new DetectionEngine(s.client, s.repository);
    await remounted.restore();
    await remounted.restore();
    expect(remounted.isReady()).toBe(true);
    expect(s.repository.get).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalled();
  });
  it("refuses model replacement/unload while a detection is pending", async () => {
    const s = setup(),
      f = files();
    await s.engine.load(f.model, f.json, "wasm");
    let finish!: (value: DetectionResult) => void;
    s.client.detect = vi.fn(
      () =>
        new Promise<DetectionResult>((resolve) => {
          finish = resolve;
        }),
    );
    const detecting = s.engine.detect(new Blob());
    await expect(s.engine.unload()).rejects.toThrow("andamento");
    finish({ detections: [], ms: 10, record });
    await detecting;
    await s.engine.unload(true);
    expect(s.repository.clear).toHaveBeenCalled();
    expect(s.engine.isReady()).toBe(false);
  });
  it("keeps an active model usable when IndexedDB runs out of space", async () => {
    const s = setup(),
      f = files();
    s.repository.put = vi.fn(async () => {
      throw new Error("quota");
    });
    await s.engine.load(f.model, f.json, "wasm");
    const state = s.engine.getSnapshot();
    expect(state.kind === "ready" && state.cacheWarning).toContain("quota");
  });
  it("does not initialize a mismatched ONNX/JSON hash", async () => {
    const s = setup(),
      f = files();
    Object.defineProperty(f.json, "text", {
      value: async () => JSON.stringify({ ...config, sha256: "0".repeat(64) }),
      configurable: true,
    });
    await expect(s.engine.load(f.model, f.json, "wasm")).rejects.toThrow("SHA-256");
    expect(s.client.load).not.toHaveBeenCalled();
    expect(s.engine.getSnapshot().kind).toBe("error");
  });
});
describe("reported execution provider", () => {
  it("reports WASM, and retains the reason, when WebGPU initialization fails", async () => {
    const create = vi.fn(async (provider: string) => {
      if (provider === "webgpu") throw new Error("GPU unavailable");
      return { session: true };
    });
    expect(await createWithFallback(create, "webgpu")).toMatchObject({
      provider: "wasm",
      fallbackReason: "GPU unavailable",
    });
    expect(create.mock.calls.map((c) => c[0])).toEqual(["webgpu", "wasm"]);
  });
});
