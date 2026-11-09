import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const pkg = new URL("node_modules/onnxruntime-web/", root);
const { version } = JSON.parse(await readFile(new URL("package.json", pkg), "utf8"));
if (version !== "1.31.1") {
  throw new Error("Update OrtRuntime.ts and validate the runtime before upgrading ONNX Runtime.");
}
const directory = new URL(`public/runtime/ort-${version}/`, root);
await mkdir(directory, { recursive: true });
const moduleName = "ort-wasm-simd-threaded.asyncify.mjs";
const wasmName = "ort-wasm-simd-threaded.asyncify.wasm";
const wasm = await readFile(new URL(`dist/${wasmName}`, pkg));
const compressed = gzipSync(wasm, { level: 6, mtime: 0 });
await writeFile(new URL(`${wasmName}.gz`, directory), compressed);
await copyFile(new URL(`dist/${moduleName}`, pkg), new URL(moduleName, directory));
await copyFile(new URL("scripts/ORT-LICENSE.txt", root), new URL("LICENSE.txt", directory));
await writeFile(
  new URL("manifest.json", directory),
  JSON.stringify(
    {
      version,
      module: moduleName,
      wasm: `${wasmName}.gz`,
      bytes: wasm.length,
      compressedBytes: compressed.length,
      sha256: createHash("sha256").update(wasm).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Local ONNX Runtime ${version}: ${compressed.length} bytes (gzip).`);
