import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { fitView, screenToImage, zoomAt } from "@/lib/annotations";
import type { Box, Detection } from "@/lib/engine/types";
import { colorFor } from "./colors";
import { pinchView, sameBox, type View, type Point } from "./viewerGeometry";

export type Tool = "pan" | "mark";
export interface ViewerHandle {
  fit: () => void;
  zoomBy: (factor: number) => void;
  zoom100: () => void;
}
interface Props {
  src: string;
  imgW: number;
  imgH: number;
  detections: Detection[];
  numbers: Record<string, number>;
  selectedId: string | null;
  tool: Tool;
  showMarks: boolean;
  markerSize: number;
  onSelect: (id: string | null) => void;
  onCreate: (b: Box) => void;
  onUpdate: (id: string, b: Box) => void;
  onZoomChange?: (zoom: number) => void;
}
type Drag =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "create"; ox: number; oy: number; box: Box }
  | { kind: "move"; id: string; ox: number; oy: number; orig: Box; box: Box; moved: boolean }
  | {
      kind: "resize";
      id: string;
      handle: string;
      orig: Box;
      box: Box;
      sx: number;
      sy: number;
      moved: boolean;
    };
const clampZoom = (zoom: number) => Math.min(40, Math.max(0.0001, zoom));
export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(p, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 }),
    viewRef = useRef(view);
  const [drag, setDrag] = useState<Drag | null>(null),
    dragRef = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ view: View; center: Point; distance: number } | null>(null);
  const blockUntilReleased = useRef(false);
  const updateView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const updateDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const fit = useCallback(() => {
    const el = wrap.current;
    if (el && p.imgW) updateView(fitView(p.imgW, p.imgH, el.clientWidth, el.clientHeight));
  }, [p.imgW, p.imgH, updateView]);
  const zoomCenter = useCallback(
    (next: number) => {
      const el = wrap.current;
      if (el)
        updateView(
          zoomAt(viewRef.current, clampZoom(next), el.clientWidth / 2, el.clientHeight / 2),
        );
    },
    [updateView],
  );
  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (factor) => zoomCenter(viewRef.current.zoom * factor),
      zoom100: () => zoomCenter(1),
    }),
    [fit, zoomCenter],
  );
  useEffect(() => {
    fit();
    pointers.current.clear();
    pinch.current = null;
    blockUntilReleased.current = false;
    dragRef.current = null;
    setDrag(null);
  }, [fit, p.src]);
  const onZoomChange = p.onZoomChange;
  useEffect(() => {
    onZoomChange?.(view.zoom);
  }, [view.zoom, onZoomChange]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      updateView({
        ...viewRef.current,
        x: viewRef.current.x + (w - last.w) / 2,
        y: viewRef.current.y + (h - last.h) / 2,
      });
      last = { w, h };
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateView]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(),
        dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      updateView(
        zoomAt(
          viewRef.current,
          clampZoom(viewRef.current.zoom * Math.exp(-dy * 0.0018)),
          e.clientX - r.left,
          e.clientY - r.top,
        ),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [updateView]);
  const local = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clampPoint = (point: Point) => ({
    x: Math.min(p.imgW, Math.max(0, point.x)),
    y: Math.min(p.imgH, Math.max(0, point.y)),
  });
  function pair() {
    const [a, b] = Array.from(pointers.current.values());
    return a && b
      ? {
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : null;
  }
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    wrap.current?.setPointerCapture?.(e.pointerId);
    const point = local(e);
    pointers.current.set(e.pointerId, point);
    if (pointers.current.size >= 2) {
      const current = pair();
      if (current) pinch.current = { view: { ...viewRef.current }, ...current };
      blockUntilReleased.current = true;
      updateDrag(null);
      return;
    }
    if (blockUntilReleased.current) return;
    const ip = screenToImage(point.x, point.y, viewRef.current),
      target = e.target as Element;
    const handle = target.getAttribute("data-handle"),
      id = target.closest("[data-id]")?.getAttribute("data-id");
    const det = id ? p.detections.find((d) => d.id === id) : undefined;
    if (p.showMarks && handle && det && !e.altKey) {
      updateDrag({
        kind: "resize",
        id: det.id,
        handle,
        orig: det,
        box: det,
        sx: point.x,
        sy: point.y,
        moved: false,
      });
      return;
    }
    if (p.showMarks && det && !e.altKey) {
      p.onSelect(det.id);
      updateDrag({
        kind: "move",
        id: det.id,
        ox: ip.x,
        oy: ip.y,
        orig: det,
        box: det,
        moved: false,
      });
      return;
    }
    if (
      p.tool === "mark" &&
      !e.altKey &&
      ip.x >= 0 &&
      ip.y >= 0 &&
      ip.x <= p.imgW &&
      ip.y <= p.imgH
    ) {
      const c = clampPoint(ip);
      updateDrag({ kind: "create", ox: c.x, oy: c.y, box: { ...c, w: 0, h: 0 } });
      return;
    }
    p.onSelect(null);
    updateDrag({
      kind: "pan",
      sx: point.x,
      sy: point.y,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
    });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const point = local(e);
    pointers.current.set(e.pointerId, point);
    if (pinch.current) {
      const current = pair();
      if (current)
        updateView(
          pinchView(
            pinch.current.view,
            pinch.current.center,
            current.center,
            pinch.current.distance,
            current.distance,
          ),
        );
      return;
    }
    if (blockUntilReleased.current) return;
    const d = dragRef.current;
    if (!d) return;
    const ip = screenToImage(point.x, point.y, viewRef.current);
    if (d.kind === "pan")
      updateView({ ...viewRef.current, x: d.vx + point.x - d.sx, y: d.vy + point.y - d.sy });
    else if (d.kind === "create") {
      const c = clampPoint(ip);
      updateDrag({
        ...d,
        box: {
          x: Math.min(d.ox, c.x),
          y: Math.min(d.oy, c.y),
          w: Math.abs(c.x - d.ox),
          h: Math.abs(c.y - d.oy),
        },
      });
    } else if (d.kind === "move") {
      updateDrag({
        ...d,
        moved: d.moved || Math.hypot(ip.x - d.ox, ip.y - d.oy) * viewRef.current.zoom > 2,
        box: {
          ...d.orig,
          x: Math.max(0, Math.min(p.imgW - d.orig.w, d.orig.x + ip.x - d.ox)),
          y: Math.max(0, Math.min(p.imgH - d.orig.h, d.orig.y + ip.y - d.oy)),
        },
      });
    } else {
      const c = clampPoint(ip),
        o = d.orig;
      let x1 = o.x,
        y1 = o.y,
        x2 = o.x + o.w,
        y2 = o.y + o.h;
      if (d.handle.includes("w")) x1 = c.x;
      if (d.handle.includes("e")) x2 = c.x;
      if (d.handle.includes("n")) y1 = c.y;
      if (d.handle.includes("s")) y2 = c.y;
      updateDrag({
        ...d,
        moved: d.moved || Math.hypot(point.x - d.sx, point.y - d.sy) > 2,
        box: {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.max(1, Math.abs(x2 - x1)),
          h: Math.max(1, Math.abs(y2 - y1)),
        },
      });
    }
  };
  const finish = (e: React.PointerEvent, cancelled = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pinch.current || blockUntilReleased.current) {
      pinch.current = null;
      updateDrag(null);
      if (pointers.current.size === 0) blockUntilReleased.current = false;
      return;
    }
    const d = dragRef.current;
    updateDrag(null);
    if (cancelled || !d) return;
    if (d.kind === "create") {
      const min = 4 / viewRef.current.zoom;
      if (d.box.w < min || d.box.h < min) {
        const size = Math.min(p.markerSize, p.imgW, p.imgH);
        p.onCreate({
          x: Math.max(0, Math.min(p.imgW - size, d.ox - size / 2)),
          y: Math.max(0, Math.min(p.imgH - size, d.oy - size / 2)),
          w: size,
          h: size,
        });
      } else p.onCreate(d.box);
    } else if ((d.kind === "move" || d.kind === "resize") && d.moved && !sameBox(d.orig, d.box))
      p.onUpdate(d.id, d.box);
  };
  const z = view.zoom,
    hs = 9 / z;
  const boxes = p.detections.map((d) =>
    drag && "id" in drag && drag.id === d.id ? { ...d, ...drag.box } : d,
  );
  const selected = boxes.find((d) => d.id === p.selectedId);
  return (
    <div
      ref={wrap}
      data-testid="photo-viewer"
      className="relative h-full w-full touch-none select-none overflow-hidden bg-viewer"
      style={{
        cursor: drag?.kind === "pan" ? "grabbing" : p.tool === "mark" ? "crosshair" : "grab",
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={(e) => finish(e, true)}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: p.imgW,
          height: p.imgH,
          transform: `translate(${view.x}px, ${view.y}px) scale(${z})`,
        }}
      >
        <img
          src={p.src}
          alt="Fotografia em análise"
          draggable={false}
          width={p.imgW}
          height={p.imgH}
          className="pointer-events-none block max-w-none"
          style={{ width: p.imgW, height: p.imgH, imageRendering: z > 3 ? "pixelated" : "auto" }}
        />
        {p.showMarks && (
          <svg
            className="absolute inset-0 overflow-visible"
            width={p.imgW}
            height={p.imgH}
            viewBox={`0 0 ${p.imgW} ${p.imgH}`}
          >
            {boxes.map((d) => {
              const col = colorFor(d),
                isSelected = d.id === p.selectedId;
              return (
                <g key={d.id} data-id={d.id} style={{ cursor: "move" }}>
                  <rect
                    x={d.x}
                    y={d.y}
                    width={d.w}
                    height={d.h}
                    fill={isSelected ? col : "transparent"}
                    fillOpacity={isSelected ? 0.15 : 0}
                    stroke={col}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={d.status === "rejected" ? "4 3" : undefined}
                    pointerEvents="all"
                  />
                  {z * Math.min(d.w, d.h) > 14 && (
                    <text
                      x={d.x + 2 / z}
                      y={d.y - 3 / z}
                      fontSize={11 / z}
                      fill={col}
                      className="font-mono"
                      pointerEvents="none"
                    >
                      {p.numbers[d.id]}
                    </text>
                  )}
                </g>
              );
            })}
            {selected &&
              ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => {
                const cx = handle.includes("w")
                  ? selected.x
                  : handle.includes("e")
                    ? selected.x + selected.w
                    : selected.x + selected.w / 2;
                const cy = handle.includes("n")
                  ? selected.y
                  : handle.includes("s")
                    ? selected.y + selected.h
                    : selected.y + selected.h / 2;
                return (
                  <rect
                    key={handle}
                    data-id={selected.id}
                    data-handle={handle}
                    x={cx - hs / 2}
                    y={cy - hs / 2}
                    width={hs}
                    height={hs}
                    className="fill-background stroke-foreground"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: `${handle}-resize` }}
                  />
                );
              })}
            {drag?.kind === "create" && (
              <rect
                x={drag.box.x}
                y={drag.box.y}
                width={drag.box.w}
                height={drag.box.h}
                fill="none"
                stroke="var(--det-manual)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
});
