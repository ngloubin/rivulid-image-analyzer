import { describe, expect, it } from "vitest";
import { fitView, screenToImage, toCSV, toJSON, zoomAt } from "@/lib/annotations";
import { nms } from "@/lib/engine/ResultProcessor";
import type { Detection } from "@/lib/engine/types";

const d: Detection = {
  id: "a",
  x: 100,
  y: 50,
  w: 20,
  h: 10,
  source: "manual",
  status: "pending",
  label: "ovo",
};
const meta = { fileName: "s.jpg", width: 4000, height: 3000, model: null, processingMs: null };

describe("coordinates", () => {
  it("maps screen to original pixels after fit and zoom", () => {
    const v = fitView(4000, 3000, 832, 632);
    expect(v.zoom).toBeCloseTo(0.2);
    const z = zoomAt(v, 1, 300, 200);
    const before = screenToImage(300, 200, v),
      after = screenToImage(300, 200, z);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(screenToImage(v.x + 0.2 * 1234, v.y + 0.2 * 567, v).x).toBeCloseTo(1234);
  });
});

describe("export", () => {
  it("JSON keeps original coordinates", () => {
    const j = JSON.parse(toJSON([d], meta));
    expect(j.detections[0]).toMatchObject({
      x: 100,
      y: 50,
      width: 20,
      height: 10,
      centerX: 110,
      centerY: 55,
    });
    expect(j.counts.total).toBe(1);
  });
  it("CSV has header plus one row", () => {
    const lines = toCSV([d], meta).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]?.split(",").slice(0, 12).join(",")).toBe(
      "1,s.jpg,ovo,manual,pending,,100,50,20,10,110,55",
    );
  });
  it("rejected boxes are excluded from count", () => {
    expect(JSON.parse(toJSON([d, { ...d, id: "b", status: "rejected" }], meta)).counts.total).toBe(
      1,
    );
  });
});

describe("nms", () => {
  it("drops overlapping lower-confidence boxes", () => {
    const r = nms(
      [
        { x: 0, y: 0, w: 10, h: 10, confidence: 0.9, classId: 0 },
        { x: 1, y: 1, w: 10, h: 10, confidence: 0.5, classId: 0 },
      ],
      0.5,
    );
    expect(r).toHaveLength(1);
  });
});
