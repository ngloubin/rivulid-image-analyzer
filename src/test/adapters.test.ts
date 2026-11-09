import { describe, it, expect } from "vitest";
import { YOLOAdapter } from "@/lib/engine/YOLOAdapter";
import { SetDetectorAdapter } from "@/lib/engine/SetDetectorAdapter";
import { parseModelConfig, resolveModelConfig } from "@/lib/engine/ModelConfig";
import { resizeGeometry, toCHW } from "@/lib/engine/ImageProcessor";
import { loaded, config } from "./model-fixture";
describe("metadata/config contracts", () => {
  it("reads names and fixed dimensions; infers only an unambiguous YOLO layout", () => {
    const c = { ...config, input: {}, output: {} };
    expect(resolveModelConfig(c, loaded.metadata)).toMatchObject({
      input: { name: "images", width: 1024, height: 1024 },
      output: { name: "output0", layout: "channels_first" },
    });
  });
  it("rejects inconsistent sizes, dynamic dimensions without config, and malformed config", () => {
    expect(() =>
      resolveModelConfig({ ...config, input: { width: 1280 } }, loaded.metadata),
    ).toThrow("diverge");
    const metadata = {
      ...loaded.metadata,
      inputs: [{ name: "images", type: "float32", shape: [1, 3, "height", "width"] }],
    };
    expect(() => resolveModelConfig({ ...config, input: {} }, metadata)).toThrow("dinâmica");
    expect(() =>
      parseModelConfig({
        ...config,
        inference: { ...config.inference, tiling: { ...config.inference.tiling, overlap: 1 } },
      }),
    ).toThrow();
    expect(() => parseModelConfig({ ...config, classes: ["same", "same"] })).toThrow("únicos");
  });
});
describe("pre/postprocessing", () => {
  it("uses RGB/255 CHW and explicit mean/std without swapping channels", () => {
    const rgba = new Uint8ClampedArray([255, 128, 0, 255, 0, 255, 64, 255]);
    expect(Array.from(toCHW(rgba, 2, 1))).toEqual([
      1,
      0,
      expect.closeTo(128 / 255),
      1,
      0,
      expect.closeTo(64 / 255),
    ]);
    expect(toCHW(rgba, 2, 1, { scale: 1 / 255, mean: [0.5, 0, 0], std: [0.5, 1, 1] })[0]).toBe(1);
  });
  it("uses integer left/top padding and inverts a 4000×3000 image exactly", () => {
    const g = resizeGeometry(4000, 3000, 1024, 1024, "letterbox");
    expect(g).toMatchObject({ padX: 0, padY: 128 });
    const out = { data: new Float32Array([512, 512, 102.4, 51.2, 0.9]), dims: [1, 5, 1] };
    const predictions = new YOLOAdapter(loaded.config).postprocess({ output0: out }, g);
    expect(predictions[0]?.x).toBeCloseTo(1800);
    expect(predictions[0]?.y).toBeCloseTo(1400);
    expect(predictions[0]?.w).toBeCloseTo(400);
    expect(predictions[0]?.h).toBeCloseTo(200);
    expect(resizeGeometry(3, 2, 8, 8, "letterbox").padY).toBe(1);
  });
  it("reads rows layout and preserves class ids", () => {
    const adapter = new YOLOAdapter({
      ...loaded.config,
      classes: ["one", "two"],
      output: { name: "output", layout: "rows" },
    });
    const result = adapter.postprocess(
      { output: { dims: [1, 1, 6], data: new Float32Array([10, 20, 4, 6, 0.1, 0.8]) } },
      { scaleX: 1, scaleY: 1, padX: 0, padY: 0 },
    );
    expect(result[0]).toMatchObject({ x: 8, y: 17, w: 4, h: 6, classId: 1 });
  });
  it("supports normalized set predictions, separate scores and no adapter NMS", () => {
    const adapter = new SetDetectorAdapter({
      ...loaded.config,
      adapter: "set-detector",
      output: {
        boxes: "boxes",
        scores: "scores",
        boxFormat: "cxcywh",
        coordinateSpace: "normalized",
        activation: "sigmoid",
      },
      preprocessing: {
        ...config.preprocessing,
        resize: "stretch",
        mean: [0.5, 0.5, 0.5],
        std: [0.5, 0.5, 0.5],
      },
    });
    const result = adapter.postprocess(
      {
        boxes: {
          dims: [1, 2, 4],
          data: new Float32Array([0.5, 0.5, 0.2, 0.2, 0.5, 0.5, 0.2, 0.2]),
        },
        scores: { dims: [1, 2, 1], data: new Float32Array([3, 2]) },
      },
      { scaleX: 2, scaleY: 2, padX: 0, padY: 0 },
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBeCloseTo(204.8);
    expect(result[0]?.confidence).toBeCloseTo(0.952574);
  });
});
