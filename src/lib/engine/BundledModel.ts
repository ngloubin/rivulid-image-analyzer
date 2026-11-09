/** The original model only. No training data or later checkpoints are distributed. */
export const BUNDLED_MODEL = {
  name: "modelo_ovos_final_teste.onnx",
  label: "Modelo original de ovos",
  base: "models/original-v2/",
  binary: "modelo_ovos_final_teste.onnx.gz",
  config: "modelo_ovos_final_teste.json",
  bytes: 10886133,
  compressedBytes: 9256845,
  sha256: "3f49b9db7073cab67bea0c3fd78e6b0348f59ae8a9b607448255e58030f3dcf7",
} as const;
