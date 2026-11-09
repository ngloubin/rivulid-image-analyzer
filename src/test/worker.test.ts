import { describe, it, expect, vi, afterEach } from "vitest";
import { WorkerClient } from "@/lib/engine/WorkerClient";
import type { WorkerRequest, WorkerResponse } from "@/lib/engine/workerProtocol";
import { record } from "./model-fixture";
class FakeWorker {
  static instance: FakeWorker;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  messages: WorkerRequest[] = [];
  terminate = vi.fn();
  constructor() {
    FakeWorker.instance = this;
  }
  postMessage(message: WorkerRequest) {
    this.messages.push(message);
    if (message.kind === "unload")
      queueMicrotask(() => this.respond({ id: message.id, kind: "result", value: null }));
  }
  respond(message: WorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }
}
afterEach(() => vi.unstubAllGlobals());
describe("Worker RPC", () => {
  it("routes progress, cancellation and results by operation id and terminates on dispose", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = new WorkerClient(),
      controller = new AbortController(),
      progress = vi.fn();
    const running = client.detect(new Blob(["image"]), controller.signal, progress),
      worker = FakeWorker.instance,
      id = worker.messages[0]!.id;
    worker.respond({ id: "unrelated", kind: "progress", progress: { completed: 99, total: 99 } });
    expect(progress).not.toHaveBeenCalled();
    worker.respond({ id, kind: "progress", progress: { completed: 1, total: 2 } });
    expect(progress).toHaveBeenCalledWith({ completed: 1, total: 2 });
    controller.abort();
    expect(worker.messages.at(-1)).toMatchObject({ id, kind: "cancel" });
    worker.respond({ id, kind: "error", name: "AbortError", message: "cancelled" });
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    const next = client.detect(new Blob());
    worker.respond({
      id: worker.messages.at(-1)!.id,
      kind: "result",
      value: { detections: [], ms: 10, record },
    });
    expect((await next).detections).toEqual([]);
    await client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
