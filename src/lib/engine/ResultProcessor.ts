import type { Box, Detection, RawPrediction } from "./types";

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

export function nms(preds: RawPrediction[], iouThr: number): RawPrediction[] {
  const sorted = [...preds].sort((a, b) => b.confidence - a.confidence);
  const keep: RawPrediction[] = [];
  for (const p of sorted) if (keep.every((k) => iou(k, p) < iouThr)) keep.push(p);
  return keep;
}

export function clampBox(b: Box, W: number, H: number): Box {
  const x = Math.max(0, Math.min(b.x, W)), y = Math.max(0, Math.min(b.y, H));
  return { x, y, w: Math.max(0, Math.min(b.x + b.w, W) - x), h: Math.max(0, Math.min(b.y + b.h, H) - y) };
}

export function toDetections(preds: RawPrediction[], W: number, H: number, label = "ovo"): Detection[] {
  return preds.map((p) => ({ ...clampBox(p, W, H), id: crypto.randomUUID(), source: "auto", status: "pending", confidence: p.confidence, label }));
}

export function counts(dets: Detection[]) {
  const active = dets.filter((d) => d.status !== "rejected");
  return {
    total: active.length,
    auto: dets.filter((d) => d.source === "auto").length,
    manual: dets.filter((d) => d.source === "manual").length,
    confirmed: dets.filter((d) => d.status === "confirmed").length,
    edited: dets.filter((d) => d.status === "edited").length,
    rejected: dets.filter((d) => d.status === "rejected").length,
    pending: dets.filter((d) => d.status === "pending").length,
  };
}
