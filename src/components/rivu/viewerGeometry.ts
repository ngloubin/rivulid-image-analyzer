export interface View {
  x: number;
  y: number;
  zoom: number;
}
export interface Point {
  x: number;
  y: number;
}
export function pinchView(
  start: View,
  from: Point,
  to: Point,
  initialDistance: number,
  distance: number,
) {
  const zoom = Math.min(
    40,
    Math.max(0.0001, (start.zoom * distance) / Math.max(1, initialDistance)),
  );
  const factor = zoom / start.zoom;
  return { zoom, x: to.x - (from.x - start.x) * factor, y: to.y - (from.y - start.y) * factor };
}
export function sameBox(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    Math.abs(a.x - b.x) < 1e-6 &&
    Math.abs(a.y - b.y) < 1e-6 &&
    Math.abs(a.w - b.w) < 1e-6 &&
    Math.abs(a.h - b.h) < 1e-6
  );
}
