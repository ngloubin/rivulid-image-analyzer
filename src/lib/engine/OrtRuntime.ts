import { z } from "zod";
import { downloadBinary } from "./HostedAssets";

const VERSION = "1.31.1";
const manifestSchema = z.object({
  version: z.literal(VERSION),
  module: z.literal("ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: z.literal("ort-wasm-simd-threaded.asyncify.wasm.gz"),
  bytes: z
    .number()
    .int()
    .positive()
    .max(64 * 1024 * 1024),
  compressedBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
let pending: Promise<typeof import("onnxruntime-web")> | undefined;

/** Called only inside the inference Worker, when a model is loaded. */
export function getOrtRuntime() {
  pending ??= (async () => {
    const ort = await import("onnxruntime-web/webgpu");
    const base = new URL(
      `${import.meta.env.BASE_URL}runtime/ort-${VERSION}/`,
      globalThis.location.origin,
    );
    const response = await fetch(new URL("manifest.json", base));
    if (!response.ok) throw new Error(`Runtime indisponível (HTTP ${response.status}).`);
    const manifest = manifestSchema.parse(await response.json());
    if (ort.env.versions.web !== VERSION) throw new Error("Versões do runtime incompatíveis.");
    ort.env.wasm.wasmBinary = new Uint8Array(
      await downloadBinary(new URL(manifest.wasm, base).href, manifest),
    );
    ort.env.wasm.wasmPaths = { mjs: new URL(manifest.module, base).href };
    return ort;
  })().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
