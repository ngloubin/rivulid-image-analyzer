import type { Detection } from "./engine/types";

export interface ExportMeta { fileName: string; width: number; height: number; model: string | null; processingMs: number | null }

export function round(n: number) { return Math.round(n * 100) / 100; }

export function toJSON(dets: Detection[], m: ExportMeta) {
  return JSON.stringify({
    software: "Rivulídeos AI", version: 1, exportedAt: new Date().toISOString(),
    image: { fileName: m.fileName, width: m.width, height: m.height },
    coordinateSystem: "pixels, original image, top-left origin, x/y = top-left corner",
    model: m.model, processingMs: m.processingMs,
    counts: { total: dets.filter((d) => d.status !== "rejected").length },
    detections: dets.map((d, i) => ({ index: i + 1, id: d.id, label: d.label, source: d.source, status: d.status,
      confidence: d.confidence ?? null, x: round(d.x), y: round(d.y), width: round(d.w), height: round(d.h),
      centerX: round(d.x + d.w / 2), centerY: round(d.y + d.h / 2) })),
  }, null, 2);
}

export function toCSV(dets: Detection[], m: ExportMeta) {
  const head = "index,file,label,source,status,confidence,x,y,width,height,center_x,center_y";
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [head, ...dets.map((d, i) => [i + 1, esc(m.fileName), d.label, d.source, d.status, d.confidence ?? "",
    round(d.x), round(d.y), round(d.w), round(d.h), round(d.x + d.w / 2), round(d.y + d.h / 2)].join(","))].join("\n");
}

/** Screen point → original-image coordinates given the viewer transform. */
export function screenToImage(px: number, py: number, view: { x: number; y: number; zoom: number }) {
  return { x: (px - view.x) / view.zoom, y: (py - view.y) / view.zoom };
}

/** Zoom around an anchor so the image point under it stays fixed. */
export function zoomAt(view: { x: number; y: number; zoom: number }, next: number, px: number, py: number) {
  const k = next / view.zoom;
  return { zoom: next, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

export function fitView(imgW: number, imgH: number, cw: number, ch: number, pad = 16) {
  const zoom = Math.min((cw - pad * 2) / imgW, (ch - pad * 2) / imgH);
  return { zoom, x: (cw - imgW * zoom) / 2, y: (ch - imgH * zoom) / 2 };
}

function colorVar(d: Detection) {
  if (d.status === "edited") return "--det-edited";
  if (d.source === "manual") return "--det-manual";
  return d.status === "confirmed" ? "--det-confirmed" : "--det-pending";
}

export async function renderAnnotatedPNG(file: Blob, dets: Detection[]): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0); bmp.close();
  const lw = Math.max(2, Math.round(Math.max(c.width, c.height) / 800));
  const css = getComputedStyle(document.documentElement);
  dets.filter((d) => d.status !== "rejected").forEach((d, i) => {
    const col = css.getPropertyValue(colorVar(d)).trim() || "red";
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = col; ctx.font = `${lw * 6}px sans-serif`; ctx.fillText(String(i + 1), d.x, Math.max(lw * 6, d.y - lw));
  });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar PNG"))), "image/png"));
}

export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
