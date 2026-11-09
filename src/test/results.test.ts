import { describe, it, expect } from "vitest";
import {
  counts,
  mergeReanalysis,
  numberDetections,
  visibleDetections,
  nms,
  nmsAsync,
  toDetections,
} from "@/lib/engine/ResultProcessor";
import type { Detection } from "@/lib/engine/types";
const make = (
  id: string,
  status: Detection["status"],
  x: number,
  source: Detection["source"] = "auto",
): Detection => ({
  id,
  status,
  x,
  y: 0,
  w: 20,
  h: 20,
  label: "ovo",
  classId: 0,
  source,
  confidence: 0.1,
});
describe("review-safe reanalysis", () => {
  it("allows cancellation while merging many global candidates", async () => {
    const controller = new AbortController();
    const boxes = Array.from({ length: 100 }, (_, i) => ({
      x: i * 20,
      y: 0,
      w: 10,
      h: 10,
      confidence: 0.9,
      classId: 0,
    }));
    const merging = nmsAsync(boxes, 0.4, controller.signal);
    controller.abort();
    await expect(merging).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retains manual, confirmed, edited and rejected annotations; replaces only pending", () => {
    const old = [
      make("m", "confirmed", 0, "manual"),
      make("c", "confirmed", 50),
      make("e", "edited", 100),
      make("r", "rejected", 150),
      make("p", "pending", 200),
    ];
    const incoming = [0, 50, 100, 150, 200, 250].map((x, i) => make("new" + i, "pending", x + 1));
    const merged = mergeReanalysis(old, incoming, 0.5);
    expect(merged.map((d) => d.id)).toEqual(["m", "c", "e", "r", "new4", "new5"]);
    for (let i = 0; i < 4; i++) expect(merged[i]).toBe(old[i]);
    expect(old).toHaveLength(5);
  });
  it("counts only reviewed/manual non-rejected annotations, independent of the slider", () => {
    const ds = [
      make("m", "pending", 0, "manual"),
      make("c", "confirmed", 50),
      make("e", "edited", 100),
      make("p", "pending", 150),
      make("r", "rejected", 200),
    ];
    expect(counts(ds, 0.25)).toMatchObject({
      total: 3,
      auto: 2,
      manual: 1,
      pending: 1,
      visiblePending: 0,
      hiddenPending: 1,
      rejected: 1,
    });
    expect(counts(ds, 0.05).total).toBe(3);
    expect(visibleDetections(ds, 0.25).map((d) => d.id)).toEqual(["m", "c", "e", "r"]);
    expect(visibleDetections(ds, 0.05)).toHaveLength(5);
    expect(numberDetections(ds).at(-1)?.index).toBe(5);
  });
  it("preserves classes and applies NMS within the same class only", () => {
    const p = { x: 0, y: 0, w: 10, h: 10, confidence: 0.9, classId: 0 };
    const raw = nms([p, { ...p, confidence: 0.8 }, { ...p, classId: 1 }], 0.4);
    expect(toDetections(raw, 100, 100, ["ovo", "outro"]).map((d) => [d.classId, d.label])).toEqual([
      [0, "ovo"],
      [1, "outro"],
    ]);
  });
});
