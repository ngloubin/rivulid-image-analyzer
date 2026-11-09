import type { LoadedModel, ModelAdapter, TensorData } from "./types";
function encodeTensor(tensor: TensorData) {
  const data = Float32Array.from(tensor.data),
    bytes = new Uint8Array(data.buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return { dims: [...tensor.dims], encoding: "float32-le/base64", data: btoa(chunks.join("")) };
}
/** A single-window diagnostic, deliberately separate from the production tiling pipeline. */
export async function paritySnapshot(
  image: ImageBitmap,
  adapter: ModelAdapter,
  loaded: LoadedModel,
  run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>>,
  signal: AbortSignal,
) {
  const prepared = await adapter.preprocess(image);
  try {
    const outputs = await run(prepared.feeds);
    try {
      if (signal.aborted) throw new DOMException("Diagnóstico cancelado.", "AbortError");
      const input = prepared.feeds[loaded.config.input.name] as TensorData;
      const payload = {
        schemaVersion: 1,
        scope: "single-image preprocessing and raw ONNX outputs; not production tiling",
        image: { width: image.width, height: image.height },
        modelHash: loaded.hash,
        modelVersion: loaded.config.version,
        config: loaded.config,
        metadata: loaded.metadata,
        provider: loaded.provider,
        transform: prepared.meta,
        input: encodeTensor(input),
        outputs: Object.fromEntries(
          Object.entries(outputs).map(([name, tensor]) => [
            name,
            encodeTensor(tensor as TensorData),
          ]),
        ),
      };
      return new Blob([JSON.stringify(payload)], { type: "application/json" });
    } finally {
      for (const value of Object.values(outputs)) (value as { dispose?: () => void }).dispose?.();
    }
  } finally {
    prepared.dispose();
  }
}
