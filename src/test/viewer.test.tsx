import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Viewer } from "@/components/rivu/Viewer";
import { pinchView } from "@/components/rivu/viewerGeometry";
import { ignoreShortcut } from "@/components/rivu/keyboard";
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1032);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1032);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const onCreate = vi.fn(),
    onUpdate = vi.fn(),
    onZoomChange = vi.fn();
  const screen = render(
    <Viewer
      src="blob:photo"
      imgW={1000}
      imgH={1000}
      detections={[
        {
          id: "a",
          x: 100,
          y: 100,
          w: 40,
          h: 40,
          label: "ovo",
          source: "auto",
          status: "confirmed",
        },
      ]}
      numbers={{ a: 1 }}
      selectedId="a"
      tool="mark"
      showMarks
      markerSize={24}
      onSelect={() => {}}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onZoomChange={onZoomChange}
    />,
  );
  return {
    ...screen,
    onCreate,
    onUpdate,
    onZoomChange,
    canvas: screen.getByTestId("photo-viewer"),
  };
}
describe("viewer gestures", () => {
  it("does not edit an annotation when a resize handle is only clicked", () => {
    const s = setup(),
      handle = s.container.querySelector('[data-handle="nw"]')!;
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 116, clientY: 116 });
    fireEvent.pointerUp(s.canvas, { pointerId: 1, clientX: 116, clientY: 116 });
    expect(s.onUpdate).not.toHaveBeenCalled();
  });
  it("uses two-finger pinch/pan without accidentally creating or committing an annotation", () => {
    const s = setup();
    fireEvent.pointerDown(s.canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(s.canvas, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(s.canvas, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(s.canvas, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(s.canvas, { pointerId: 1, clientX: 120, clientY: 120 });
    fireEvent.pointerUp(s.canvas, { pointerId: 1, clientX: 120, clientY: 120 });
    expect(s.onZoomChange).toHaveBeenLastCalledWith(2);
    expect(s.onCreate).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });
  it("drops a cancelled drawing instead of creating a dot", () => {
    const s = setup();
    fireEvent.pointerDown(s.canvas, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerCancel(s.canvas, { pointerId: 1 });
    expect(s.onCreate).not.toHaveBeenCalled();
  });
  it("preserves the image point under the pinch center while panning", () => {
    const result = pinchView(
      { x: 10, y: 20, zoom: 2 },
      { x: 100, y: 100 },
      { x: 130, y: 140 },
      100,
      150,
    );
    expect((130 - result.x) / result.zoom).toBeCloseTo(45);
    expect((140 - result.y) / result.zoom).toBeCloseTo(40);
  });
  it("ignores Ctrl/Cmd/Alt shortcuts", () => {
    expect(ignoreShortcut({ ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(ignoreShortcut({ ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
    expect(ignoreShortcut({ ctrlKey: false, metaKey: false, altKey: true })).toBe(true);
  });
});
