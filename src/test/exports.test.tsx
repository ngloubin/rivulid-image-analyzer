import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { toJSON, toCSV, renderAnnotatedPNG, planPNG } from "@/lib/annotations";
import { Viewer } from "@/components/rivu/Viewer";
import { numberDetections } from "@/lib/engine/ResultProcessor";
import type { Detection } from "@/lib/engine/types";
const ds: Detection[] = ["confirmed", "rejected", "pending"].map((status, i) => ({
  id: String(i),
  x: 100 + i * 50,
  y: 100,
  w: 40,
  h: 40,
  label: "ovo",
  source: "auto",
  status: status as Detection["status"],
  confidence: 0.8,
}));
const meta = { fileName: "foto.jpg", width: 1000, height: 1000, model: null, processingMs: null };
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("consistent audit numbering", () => {
  it("uses the exact same labels in PNG, JSON, CSV and viewer with a rejection in the middle", async () => {
    const ctx = {
      drawImage: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(new Blob(["png"])),
    );
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1000, height: 1000, close }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1032);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1032);
    await renderAnnotatedPNG(new Blob(), ds);
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toEqual(["1", "3"]);
    expect(close).toHaveBeenCalled();
    const json = JSON.parse(toJSON(ds, meta));
    expect(json.detections.map((d: { index: number }) => d.index)).toEqual([1, 2, 3]);
    expect(json.counts).toMatchObject({ total: 1, pending: 1, rejected: 1 });
    expect(
      toCSV(ds, meta)
        .split("\n")
        .slice(1)
        .map((line) => Number(line.split(",")[0])),
    ).toEqual([1, 2, 3]);
    const screen = render(
      <Viewer
        src="blob:photo"
        imgW={1000}
        imgH={1000}
        detections={ds.filter((d) => d.status !== "rejected")}
        numbers={Object.fromEntries(numberDetections(ds).map(({ d, index }) => [d.id, index]))}
        selectedId={null}
        tool="mark"
        showMarks
        markerSize={24}
        onSelect={() => {}}
        onCreate={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.container.querySelectorAll("svg text")).toHaveLength(2);
    expect(
      Array.from(screen.container.querySelectorAll("svg text")).map((t) => t.textContent),
    ).toEqual(["1", "3"]);
  });
  it("does not allocate oversized original canvases without explicit reduced export", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({
      width: 30000,
      height: 20000,
      close: vi.fn(),
    }));
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    await expect(renderAnnotatedPNG(new Blob(), ds)).rejects.toThrow("PNG original");
    expect(spy).not.toHaveBeenCalled();
    const plan = planPNG(30000, 20000);
    expect(plan.width * plan.height).toBeLessThanOrEqual(16777216);
  });
});
