import type { Detection, InferenceRecord } from "./engine/types";
import { counts, isFinal, numberDetections, visibleDetections } from "./engine/ResultProcessor";

export interface ExportMeta {
  fileName: string;
  width: number;
  height: number;
  model: string | null;
  processingMs: number | null;
  displayThreshold?: number;
  runs?: InferenceRecord[];
}
export function round(n: number) {
  return Math.round(n * 100) / 100;
}
export function annotationRows(dets: Detection[], threshold = 0) {
  const visible = new Set(visibleDetections(dets, threshold).map((d) => d.id));
  return numberDetections(dets).map(({ d, index }) => ({
    d,
    index,
    visible: visible.has(d.id),
    counted: isFinal(d),
  }));
}
export function toJSON(dets: Detection[], m: ExportMeta) {
  return JSON.stringify(
    {
      software: "Rivulídeos AI",
      version: 2,
      exportedAt: new Date().toISOString(),
      image: { fileName: m.fileName, width: m.width, height: m.height },
      coordinateSystem: "pixels, original image, top-left origin, x/y = top-left corner",
      countingPolicy:
        "reviewed-only: non-rejected manual annotations + confirmed/edited automatic detections; pending excluded",
      numberingPolicy: "one-based audit order, preserved across confidence/rejection filters",
      displayThreshold: m.displayThreshold ?? 0,
      model: m.model,
      processingMs: m.processingMs,
      analysisHistory: m.runs ?? [],
      counts: counts(dets, m.displayThreshold ?? 0),
      detections: annotationRows(dets, m.displayThreshold ?? 0).map(
        ({ d, index, visible, counted }) => ({
          index,
          id: d.id,
          label: d.label,
          classId: d.classId ?? null,
          source: d.source,
          status: d.status,
          confidence: d.confidence ?? null,
          visible,
          counted,
          provenance: d.provenance ?? null,
          x: round(d.x),
          y: round(d.y),
          width: round(d.w),
          height: round(d.h),
          centerX: round(d.x + d.w / 2),
          centerY: round(d.y + d.h / 2),
        }),
      ),
    },
    null,
    2,
  );
}
export function toCSV(dets: Detection[], m: ExportMeta) {
  const head =
    "index,file,label,source,status,confidence,x,y,width,height,center_x,center_y,id,class_id,visible,counted,run_id,model_sha256,model_version";
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [
    head,
    ...annotationRows(dets, m.displayThreshold ?? 0).map(({ d, index, visible, counted }) =>
      [
        index,
        m.fileName,
        d.label,
        d.source,
        d.status,
        d.confidence ?? "",
        round(d.x),
        round(d.y),
        round(d.w),
        round(d.h),
        round(d.x + d.w / 2),
        round(d.y + d.h / 2),
        d.id,
        d.classId ?? "",
        visible,
        counted,
        d.provenance?.runId ?? "",
        d.provenance?.modelHash ?? "",
        d.provenance?.modelVersion ?? "",
      ]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
}
export function screenToImage(
  px: number,
  py: number,
  view: { x: number; y: number; zoom: number },
) {
  return { x: (px - view.x) / view.zoom, y: (py - view.y) / view.zoom };
}
export function zoomAt(
  view: { x: number; y: number; zoom: number },
  next: number,
  px: number,
  py: number,
) {
  const k = next / view.zoom;
  return { zoom: next, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}
export function fitView(imgW: number, imgH: number, cw: number, ch: number, pad = 16) {
  const zoom = Math.max(
    0.0001,
    Math.min(Math.max(1, cw - pad * 2) / imgW, Math.max(1, ch - pad * 2) / imgH),
  );
  return { zoom, x: (cw - imgW * zoom) / 2, y: (ch - imgH * zoom) / 2 };
}
function colorVar(d: Detection) {
  if (d.status === "edited") return "--det-edited";
  if (d.source === "manual") return "--det-manual";
  return d.status === "confirmed" ? "--det-confirmed" : "--det-pending";
}
export function planPNG(width: number, height: number, maxSide = 8192, maxPixels = 16777216) {
  const scale = Math.min(
    1,
    maxSide / width,
    maxSide / height,
    Math.sqrt(maxPixels / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}
export async function renderAnnotatedPNG(
  file: Blob,
  dets: Detection[],
  options: { confidenceThreshold?: number; allowDownscale?: boolean } = {},
): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    const plan = planPNG(bmp.width, bmp.height);
    if (plan.scale < 1 && !options.allowDownscale)
      throw new Error(
        "Fotografia grande demais para exportação PNG original segura. Escolha PNG reduzido ou JSON/CSV.",
      );
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Memória insuficiente para PNG; exporte JSON/CSV.");
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const lw = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) / 800));
    const css = getComputedStyle(document.documentElement);
    for (const { d, index, visible } of annotationRows(dets, options.confidenceThreshold ?? 0)) {
      if (!visible || d.status === "rejected") continue;
      const col = css.getPropertyValue(colorVar(d)).trim() || "red";
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.strokeRect(d.x * plan.scale, d.y * plan.scale, d.w * plan.scale, d.h * plan.scale);
      ctx.fillStyle = col;
      ctx.font = `${lw * 6}px sans-serif`;
      ctx.fillText(String(index), d.x * plan.scale, Math.max(lw * 6, d.y * plan.scale - lw));
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG. Exporte JSON/CSV."))),
        "image/png",
      ),
    );
  } finally {
    bmp.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
