import type { Box, Detection, RawPrediction } from "./types";

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x),
    y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w),
    y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
export function validPrediction(p: RawPrediction) {
  return (
    [p.x, p.y, p.w, p.h, p.confidence, p.classId].every(Number.isFinite) &&
    p.w > 0 &&
    p.h > 0 &&
    p.confidence >= 0 &&
    p.confidence <= 1 &&
    Number.isInteger(p.classId) &&
    p.classId >= 0
  );
}
/** Class-aware; detectors that do not require suppression can skip this entirely. */
export function nms(preds: RawPrediction[], threshold: number): RawPrediction[] {
  const sorted = preds.filter(validPrediction).sort((a, b) => b.confidence - a.confidence);
  const keep: RawPrediction[] = [];
  for (const p of sorted)
    if (keep.every((k) => k.classId !== p.classId || iou(k, p) <= threshold)) keep.push(p);
  return keep;
}
export function clampBox(b: Box, W: number, H: number): Box {
  const x = Math.max(0, Math.min(b.x, W)),
    y = Math.max(0, Math.min(b.y, H));
  return {
    x,
    y,
    w: Math.max(0, Math.min(b.x + b.w, W) - x),
    h: Math.max(0, Math.min(b.y + b.h, H) - y),
  };
}
export function toDetections(
  preds: RawPrediction[],
  W: number,
  H: number,
  classes: readonly string[] = ["ovo"],
): Detection[] {
  return preds
    .filter((p) => validPrediction(p) && p.classId < classes.length)
    .map((p) => ({
      ...clampBox(p, W, H),
      id: crypto.randomUUID(),
      source: "auto" as const,
      status: "pending" as const,
      confidence: p.confidence,
      classId: p.classId,
      label: classes[p.classId]!,
    }))
    .filter((p) => p.w > 0 && p.h > 0);
}
export function isFinal(d: Detection) {
  return (
    d.status !== "rejected" &&
    (d.source === "manual" || d.status === "confirmed" || d.status === "edited")
  );
}
/** Stable audit numbering: filtering never renumbers the remaining annotations. */
export function numberDetections(dets: readonly Detection[]) {
  return dets.map((d, index) => ({ d, index: index + 1 }));
}
export function visibleDetections(dets: readonly Detection[], threshold: number) {
  return dets.filter(
    (d) => d.source === "manual" || d.status !== "pending" || (d.confidence ?? 0) >= threshold,
  );
}
export function counts(dets: readonly Detection[], threshold = 0) {
  const final = dets.filter(isFinal);
  const pending = dets.filter((d) => d.source === "auto" && d.status === "pending");
  return {
    total: final.length,
    auto: final.filter((d) => d.source === "auto").length,
    manual: final.filter((d) => d.source === "manual").length,
    confirmed: final.filter((d) => d.source === "auto" && d.status === "confirmed").length,
    edited: final.filter((d) => d.source === "auto" && d.status === "edited").length,
    rejected: dets.filter((d) => d.status === "rejected").length,
    pending: pending.length,
    visiblePending: pending.filter((d) => (d.confidence ?? 0) >= threshold).length,
    hiddenPending: pending.filter((d) => (d.confidence ?? 0) < threshold).length,
  };
}
/** Reviewed annotations (including rejections) always win; pending candidates may be refreshed. */
export function mergeReanalysis(
  previous: readonly Detection[],
  incoming: readonly Detection[],
  threshold: number,
) {
  const reviewed = previous.filter((d) => d.source === "manual" || d.status !== "pending");
  const fresh = incoming.filter((d) => !reviewed.some((r) => iou(r, d) >= threshold));
  return [...reviewed, ...fresh];
}

/** Global merge yields regularly so cancel messages can be handled by the Worker. */
export async function nmsAsync(preds: RawPrediction[], threshold: number, signal?: AbortSignal) {
  const check = () => {
    if (signal?.aborted) throw new DOMException("Análise cancelada.", "AbortError");
  };
  check();
  const sorted = preds.filter(validPrediction).sort((a, b) => b.confidence - a.confidence);
  const keep: RawPrediction[] = [];
  let comparisons = 0;
  for (const prediction of sorted) {
    let suppressed = false;
    for (const previous of keep) {
      if (previous.classId === prediction.classId && iou(previous, prediction) > threshold) {
        suppressed = true;
        break;
      }
      if (++comparisons % 2048 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check();
      }
    }
    if (!suppressed) keep.push(prediction);
  }
  check();
  return keep;
}
