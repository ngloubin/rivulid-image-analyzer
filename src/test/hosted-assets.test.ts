import { describe, it, expect, vi, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { downloadBinary, sha256 } from "@/lib/engine/HostedAssets";

afterEach(() => vi.unstubAllGlobals());
describe("hosted binary integrity", () => {
  it("accepts a host-decompressed response with the correct original hash", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new TextEncoder().encode("valid-onnx-test").buffer;
    const expected = { bytes: bytes.byteLength, compressedBytes: 5, sha256: await sha256(bytes) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes })),
    );
    expect(await downloadBinary("/models/model.onnx.gz", expected)).toEqual(bytes);
  });
  it("rejects truncated or modified assets instead of passing them to ORT", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const expected = { bytes: 14, compressedBytes: 5, sha256: "0".repeat(64) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("wrong-onnx-tst").buffer,
      })),
    );
    await expect(downloadBinary("/models/model.onnx.gz", expected)).rejects.toThrow("SHA-256");
  });
});
