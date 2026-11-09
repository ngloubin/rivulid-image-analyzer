export async function sha256(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Only model/runtime assets are downloaded. Photographs never use this path. */
export async function downloadBinary(
  url: string,
  expected: { bytes: number; compressedBytes: number; sha256: string },
) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível baixar ${url} (HTTP ${response.status}).`);
  // Some hosts transparently decompress .gz responses; accept either representation.
  let buffer = await response.arrayBuffer();
  if (buffer.byteLength > Math.max(expected.bytes, expected.compressedBytes))
    throw new Error(`Tamanho inesperado ao baixar ${url}.`);
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("Atualize o navegador para carregar o modelo incluído (gzip).");
    buffer = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  }
  if (buffer.byteLength !== expected.bytes || (await sha256(buffer)) !== expected.sha256)
    throw new Error(`Arquivo incompleto ou SHA-256 inválido: ${url}.`);
  return buffer;
}
