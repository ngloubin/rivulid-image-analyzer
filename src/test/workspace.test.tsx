import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, cleanup, act } from "@testing-library/react";
import type { EngineState } from "@/lib/engine/DetectionEngine";
import type { Detection, DetectionResult, Box } from "@/lib/engine/types";
import { loaded, record } from "./model-fixture";

const fake = vi.hoisted(() => ({
  snapshot: { kind: "none" } as EngineState,
  detect: vi.fn(),
  imageInfo: vi.fn(),
  errors: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: fake.errors, success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/engine/DetectionEngine", async () => {
  const results = await import("@/lib/engine/ResultProcessor");
  return {
    engine: {
      getSnapshot: () => fake.snapshot,
      getServerSnapshot: () => fake.snapshot,
      subscribe: () => () => {},
      restore: async () => {},
      isReady: () => fake.snapshot.kind === "ready",
      detect: fake.detect,
      imageInfo: fake.imageInfo,
      validateImageFile: () => null,
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
      ...results,
    },
  };
});
vi.mock("@/components/rivu/Viewer", () => ({
  Viewer: (p: {
    onCreate: (b: Box) => void;
    onSelect: (id: string) => void;
    detections: Detection[];
  }) => (
    <div>
      <button onClick={() => p.onCreate({ x: 10, y: 10, w: 20, h: 20 })}>Marcar teste</button>
      {p.detections.map((d) => (
        <button key={d.id} onClick={() => p.onSelect(d.id)}>
          Selecionar {d.id}
        </button>
      ))}
    </div>
  ),
}));
import { Workspace } from "@/components/rivu/Workspace";
const make = (id: string, x: number): Detection => ({
  id,
  x,
  y: 100,
  w: 20,
  h: 20,
  label: "ovo",
  source: "auto",
  status: "pending",
  confidence: 0.9,
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  fake.snapshot = { kind: "ready", ...loaded, cacheWarning: null };
  fake.detect.mockReset();
  fake.errors.mockClear();
  fake.imageInfo.mockResolvedValue({ width: 1000, height: 1000 });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openPhoto() {
  render(<Workspace />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Abrir fotografias"), {
      target: { files: [new File(["test"], "foto.jpg", { type: "image/jpeg" })] },
    });
  });
  expect(fake.errors.mock.calls).toEqual([]);
  await screen.findByText("Marcar teste");
}
function finalCount() {
  return screen.getByText("Total final").previousElementSibling;
}
describe("workspace integration", () => {
  it("keeps Ctrl+R from rejecting a selection and supports undo per photograph", async () => {
    await openPhoto();
    fireEvent.click(screen.getByText("Marcar teste"));
    expect(finalCount()).toHaveTextContent("1");
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(finalCount()).toHaveTextContent("1");
    fireEvent.keyDown(window, { key: "r" });
    expect(finalCount()).toHaveTextContent("0");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(finalCount()).toHaveTextContent("1");
  }, 15000);
  it("preserves edits/rejections made during an in-flight reanalysis", async () => {
    await openPhoto();
    fireEvent.click(screen.getByText("Marcar teste"));
    fake.detect.mockResolvedValueOnce({
      detections: [make("a", 100), make("b", 200), make("p", 300)],
      ms: 10,
      record,
    });
    fireEvent.click(screen.getByText("Analisar imagem"));
    await screen.findByLabelText("Confirmar 2");
    fireEvent.click(screen.getByLabelText("Confirmar 2"));
    fireEvent.click(screen.getByLabelText("Rejeitar 3"));
    let finish!: (r: DetectionResult) => void;
    fake.detect.mockImplementationOnce(
      () =>
        new Promise<DetectionResult>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByText("Reanalisar imagem"));
    await screen.findByText("Cancelar análise");
    fireEvent.click(screen.getByLabelText("Confirmar 4"));
    await act(async () =>
      finish({
        detections: [make("new-a", 100), make("new-b", 200), make("new-p", 300)],
        ms: 11,
        record: { ...record, runId: "run-2" },
      }),
    );
    await waitFor(() => expect(screen.queryByText("Cancelar análise")).not.toBeInTheDocument());
    expect(screen.getByText("Selecionar a")).toBeInTheDocument();
    expect(screen.getByText("Selecionar b")).toBeInTheDocument();
    expect(screen.getByText("Selecionar p")).toBeInTheDocument();
    expect(screen.queryByText("Selecionar new-a")).not.toBeInTheDocument();
    expect(finalCount()).toHaveTextContent("3");
    expect(window.confirm).toHaveBeenCalled();
  }, 15000);
  it("cancels without applying partial detections or losing manual annotations", async () => {
    await openPhoto();
    fireEvent.click(screen.getByText("Marcar teste"));
    fake.detect.mockImplementationOnce(
      (_file: Blob, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("cancel", "AbortError")),
          ),
        ),
    );
    fireEvent.click(screen.getByText("Analisar imagem"));
    fireEvent.click(await screen.findByText("Cancelar análise"));
    await waitFor(() => expect(screen.queryByText("Cancelar análise")).not.toBeInTheDocument());
    expect(finalCount()).toHaveTextContent("1");
  }, 15000);
});
