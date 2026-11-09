import { describe, it, expect, vi } from "vitest";
import { runPipeline, windows, windowCount } from "@/lib/engine/InferencePipeline";
import type { ModelAdapter } from "@/lib/engine/types";
import { loaded } from "./model-fixture";
const image = { width: 800, height: 512, close: vi.fn() } as unknown as ImageBitmap;
function setup() {
  const dispose = vi.fn(),
    close = vi.fn();
  const adapter: ModelAdapter = {
    name: "fake",
    config: loaded.config,
    async preprocess(tile) {
      return { feeds: {}, meta: (tile as unknown as { originX: number }).originX, dispose };
    },
    postprocess(_outputs, meta) {
      return [{ x: 500 - Number(meta), y: 100, w: 20, h: 20, confidence: 0.9, classId: 0 }];
    },
  };
  const crop = (_image: ImageBitmap, w: { x: number; width: number; height: number }) =>
    ({ width: w.width, height: w.height, originX: w.x, close }) as unknown as ImageBitmap;
  return { adapter, crop, dispose, close };
}
describe("windowed inference contract", () => {
  it("merges one object across a window edge and returns original image pixels", async () => {
    const s = setup(),
      onProgress = vi.fn(),
      outputDispose = vi.fn();
    const run = vi.fn(async () => ({ tensor: { dispose: outputDispose } }));
    const result = await runPipeline(image, s.adapter, run, { crop: s.crop, onProgress });
    expect(result.windows).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]).toMatchObject({ x: 500, y: 100, w: 20, h: 20, classId: 0 });
    expect(
      onProgress.mock.calls.filter(([p]) => p.stage !== "merging").map(([p]) => p.completed),
    ).toEqual([0, 1, 2]);
    expect(s.dispose).toHaveBeenCalledTimes(2);
    expect(s.close).toHaveBeenCalledTimes(2);
    expect(outputDispose).toHaveBeenCalledTimes(2);
  });
  it("covers final borders and handles smaller images without duplicate positions", () => {
    const t = {
      ...loaded.config.inference.tiling,
      tileSizes: [
        { width: 512, height: 512 },
        { width: 1024, height: 1024 },
      ],
    };
    expect([...windows(800, 512, t)]).toEqual([
      { x: 0, y: 0, width: 512, height: 512 },
      { x: 288, y: 0, width: 512, height: 512 },
      { x: 0, y: 0, width: 800, height: 512 },
    ]);
    expect(windowCount(800, 512, t)).toBe(3);
  });
  it("cancels before the next window and disposes all allocated resources", async () => {
    const s = setup(),
      controller = new AbortController();
    await expect(
      runPipeline(image, s.adapter, async () => ({}), {
        crop: s.crop,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.completed === 1) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(s.dispose).toHaveBeenCalledTimes(1);
    expect(s.close).toHaveBeenCalledTimes(1);
  });
  it("cleans up tensors and windows after postprocessing errors", async () => {
    const s = setup(),
      dispose = vi.fn();
    s.adapter.postprocess = () => {
      throw new Error("bad shape");
    };
    await expect(
      runPipeline(image, s.adapter, async () => ({ output: { dispose } }), { crop: s.crop }),
    ).rejects.toThrow("bad shape");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(s.dispose).toHaveBeenCalledTimes(1);
    expect(s.close).toHaveBeenCalledTimes(1);
  });
  it("supports adapters with both NMS stages disabled", async () => {
    const s = setup();
    s.adapter = {
      ...s.adapter,
      config: {
        ...s.adapter.config,
        inference: { ...s.adapter.config.inference, windowNmsIou: null, globalNmsIou: null },
      },
    };
    expect(
      (await runPipeline(image, s.adapter, async () => ({}), { crop: s.crop })).detections,
    ).toHaveLength(2);
  });
  it("rejects excessive window counts before allocating tiles", async () => {
    const s = setup();
    s.adapter = {
      ...s.adapter,
      config: {
        ...s.adapter.config,
        inference: {
          ...s.adapter.config.inference,
          tiling: { ...s.adapter.config.inference.tiling, maxWindows: 1 },
        },
      },
    };
    const crop = vi.fn(s.crop);
    await expect(runPipeline(image, s.adapter, async () => ({}), { crop })).rejects.toThrow(
      "maxWindows",
    );
    expect(crop).not.toHaveBeenCalled();
  });
});
