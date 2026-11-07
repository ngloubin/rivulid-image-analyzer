import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { fitView, screenToImage, zoomAt } from "@/lib/annotations";
import type { Box, Detection } from "@/lib/engine/types";
import { colorFor } from "./colors";

export type Tool = "pan" | "mark";
export interface ViewerHandle { fit: () => void; zoomBy: (f: number) => void; zoom100: () => void }
type View = { x: number; y: number; zoom: number };

interface Props {
  src: string; imgW: number; imgH: number;
  detections: Detection[]; selectedId: string | null; tool: Tool; showMarks: boolean; markerSize: number;
  onSelect: (id: string | null) => void;
  onCreate: (b: Box) => void;
  onUpdate: (id: string, b: Box) => void;
  onZoomChange?: (z: number) => void;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "create"; ox: number; oy: number; box: Box }
  | { kind: "move"; id: string; ox: number; oy: number; orig: Box; box: Box; moved: boolean }
  | { kind: "resize"; id: string; handle: string; orig: Box; box: Box };

const MIN_Z = 0.02, MAX_Z = 40;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(p, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;

  const fit = useCallback(() => {
    const el = wrap.current; if (!el || !p.imgW) return;
    setView(fitView(p.imgW, p.imgH, el.clientWidth, el.clientHeight));
  }, [p.imgW, p.imgH]);

  const zoomCenter = useCallback((next: number) => {
    const el = wrap.current; if (!el) return;
    setView((v) => zoomAt(v, clampZ(next), el.clientWidth / 2, el.clientHeight / 2));
  }, []);

  useImperativeHandle(ref, () => ({ fit, zoomBy: (f) => zoomCenter(viewRef.current.zoom * f), zoom100: () => zoomCenter(1) }), [fit, zoomCenter]);
  useEffect(() => { fit(); }, [fit, p.src]);
  useEffect(() => { p.onZoomChange?.(view.zoom); }, [view.zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refit on container resize only while the user hasn't diverged much — simple: keep center stable.
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      setView((v) => ({ ...v, x: v.x + (w - last.w) / 2, y: v.y + (h - last.h) / 2 }));
      last = { w, h };
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setView((v) => zoomAt(v, clampZ(v.zoom * Math.exp(-dy * 0.0018)), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const local = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const clampPt = (pt: { x: number; y: number }) => ({ x: Math.min(p.imgW, Math.max(0, pt.x)), y: Math.min(p.imgH, Math.max(0, pt.y)) });

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    wrap.current!.setPointerCapture(e.pointerId);
    const { sx, sy } = local(e);
    const ip = screenToImage(sx, sy, view);
    const t = e.target as Element;
    const handle = t.getAttribute("data-handle"), id = t.closest("[data-id]")?.getAttribute("data-id");
    const det = id ? p.detections.find((d) => d.id === id) : undefined;
    if (p.showMarks && handle && det) { setDrag({ kind: "resize", id: det.id, handle, orig: det, box: det }); return; }
    if (p.showMarks && det && !e.altKey) {
      p.onSelect(det.id);
      setDrag({ kind: "move", id: det.id, ox: ip.x, oy: ip.y, orig: det, box: det, moved: false }); return;
    }
    if (p.tool === "mark" && !e.altKey) {
      const c = clampPt(ip);
      setDrag({ kind: "create", ox: c.x, oy: c.y, box: { x: c.x, y: c.y, w: 0, h: 0 } }); return;
    }
    p.onSelect(null);
    setDrag({ kind: "pan", sx, sy, vx: view.x, vy: view.y });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const { sx, sy } = local(e);
    const ip = screenToImage(sx, sy, viewRef.current);
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.vx + sx - d.sx, y: d.vy + sy - d.sy }));
    else if (d.kind === "create") {
      const c = clampPt(ip);
      setDrag({ ...d, box: { x: Math.min(d.ox, c.x), y: Math.min(d.oy, c.y), w: Math.abs(c.x - d.ox), h: Math.abs(c.y - d.oy) } });
    } else if (d.kind === "move") {
      const nx = Math.min(p.imgW - d.orig.w, Math.max(0, d.orig.x + ip.x - d.ox));
      const ny = Math.min(p.imgH - d.orig.h, Math.max(0, d.orig.y + ip.y - d.oy));
      setDrag({ ...d, moved: d.moved || Math.abs(ip.x - d.ox) * viewRef.current.zoom > 2 || Math.abs(ip.y - d.oy) * viewRef.current.zoom > 2, box: { ...d.orig, x: nx, y: ny } });
    } else if (d.kind === "resize") {
      const c = clampPt(ip), o = d.orig;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (d.handle.includes("w")) x1 = c.x; if (d.handle.includes("e")) x2 = c.x;
      if (d.handle.includes("n")) y1 = c.y; if (d.handle.includes("s")) y2 = c.y;
      setDrag({ ...d, box: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) } });
    }
  };

  const onUp = () => {
    const d = dragRef.current; setDrag(null); if (!d) return;
    if (d.kind === "create") {
      const minPx = 4 / viewRef.current.zoom;
      if (d.box.w < minPx || d.box.h < minPx) {
        const s = p.markerSize;
        const b = { x: d.ox - s / 2, y: d.oy - s / 2, w: s, h: s };
        p.onCreate({ x: Math.max(0, Math.min(p.imgW - s, b.x)), y: Math.max(0, Math.min(p.imgH - s, b.y)), w: s, h: s });
      } else p.onCreate(d.box);
    } else if (d.kind === "move" && d.moved) p.onUpdate(d.id, d.box);
    else if (d.kind === "resize") p.onUpdate(d.id, d.box);
  };

  const z = view.zoom, hs = 9 / z;
  const boxes = p.detections.map((d) => (drag && "id" in drag && drag.id === d.id ? { ...d, ...drag.box } : d));
  const sel = boxes.find((b) => b.id === p.selectedId);
  const cursor = drag?.kind === "pan" ? "grabbing" : p.tool === "mark" ? "crosshair" : "grab";

  return (
    <div ref={wrap} className="relative h-full w-full touch-none select-none overflow-hidden bg-viewer" style={{ cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: p.imgW, height: p.imgH, transform: `translate(${view.x}px, ${view.y}px) scale(${z})` }}>
        <img src={p.src} alt="Fotografia em análise" draggable={false} width={p.imgW} height={p.imgH}
          className="pointer-events-none block max-w-none" style={{ width: p.imgW, height: p.imgH, imageRendering: z > 3 ? "pixelated" : "auto" }} />
        {p.showMarks && (
          <svg className="absolute inset-0 overflow-visible" width={p.imgW} height={p.imgH} viewBox={`0 0 ${p.imgW} ${p.imgH}`}>
            {boxes.map((d, i) => {
              const col = colorFor(d), isSel = d.id === p.selectedId;
              return (
                <g key={d.id} data-id={d.id} style={{ cursor: "move" }}>
                  <rect x={d.x} y={d.y} width={d.w} height={d.h} fill={isSel ? col : "transparent"} fillOpacity={isSel ? 0.15 : 0}
                    stroke={col} strokeWidth={isSel ? 2.5 : 1.5} vectorEffect="non-scaling-stroke"
                    strokeDasharray={d.status === "rejected" ? "4 3" : undefined} pointerEvents="all" />
                  {z * Math.min(d.w, d.h) > 14 && (
                    <text x={d.x + 2 / z} y={d.y - 3 / z} fontSize={11 / z} fill={col} className="font-mono" pointerEvents="none">{i + 1}</text>
                  )}
                </g>
              );
            })}
            {sel && ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => {
              const cx = h.includes("w") ? sel.x : h.includes("e") ? sel.x + sel.w : sel.x + sel.w / 2;
              const cy = h.includes("n") ? sel.y : h.includes("s") ? sel.y + sel.h : sel.y + sel.h / 2;
              return <rect key={h} data-id={sel.id} data-handle={h} x={cx - hs / 2} y={cy - hs / 2} width={hs} height={hs}
                className="fill-background stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: `${h}-resize` }} />;
            })}
            {drag?.kind === "create" && (
              <rect x={drag.box.x} y={drag.box.y} width={drag.box.w} height={drag.box.h} fill="none" stroke="var(--det-manual)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        )}
      </div>
    </div>
  );
});
