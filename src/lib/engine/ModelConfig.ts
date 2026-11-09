import { z } from "zod";
import type { ModelMetadata } from "./types";

const dimension = z.number().int().positive().max(16384);
const threshold = z.number().finite().min(0).max(1);
const triple = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const modelConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    version: z.string().min(1),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    adapter: z.enum(["yolo", "set-detector"]),
    classes: z.array(z.string().min(1)).nonempty(),
    input: z
      .object({
        name: z.string().min(1).optional(),
        width: dimension.optional(),
        height: dimension.optional(),
      })
      .strict(),
    preprocessing: z
      .object({
        resize: z.enum(["letterbox", "stretch"]),
        scale: z.number().finite().positive(),
        mean: triple,
        std: triple.refine((v) => v.every((n) => n > 0), "Desvios devem ser positivos."),
        padValue: z.number().int().min(0).max(255),
      })
      .strict(),
    output: z
      .object({
        name: z.string().min(1).optional(),
        layout: z.enum(["channels_first", "rows"]).optional(),
        boxes: z.string().min(1).optional(),
        scores: z.string().min(1).optional(),
        boxFormat: z.enum(["cxcywh", "xyxy"]).optional(),
        coordinateSpace: z.enum(["normalized", "input"]).optional(),
        activation: z.enum(["none", "sigmoid", "softmax"]).optional(),
        backgroundIndex: z.number().int().nonnegative().optional(),
      })
      .strict(),
    inference: z
      .object({
        candidateThreshold: threshold,
        windowNmsIou: threshold.nullable(),
        globalNmsIou: threshold.nullable(),
        reviewMergeIou: z.number().positive().max(1),
        tiling: z
          .object({
            enabled: z.boolean(),
            tileSizes: z.array(z.object({ width: dimension, height: dimension }).strict()),
            overlap: z.number().finite().min(0).max(0.9),
            maxWindows: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.classes).size !== c.classes.length)
      ctx.addIssue({ code: "custom", message: "Nomes de classes devem ser únicos." });
    if (c.inference.tiling.enabled && c.inference.tiling.tileSizes.length === 0)
      ctx.addIssue({ code: "custom", message: "Informe ao menos um tamanho de janela." });
    if (
      c.adapter === "set-detector" &&
      (!c.output.boxes ||
        !c.output.scores ||
        !c.output.boxFormat ||
        !c.output.coordinateSpace ||
        !c.output.activation)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Detector por conjunto exige nomes de boxes/scores, formato, coordenadas e ativação explícitos.",
      });
  });
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type ResolvedModelConfig = ModelConfig & {
  input: { name: string; width: number; height: number };
};

export function parseModelConfig(value: unknown): ModelConfig {
  const result = modelConfigSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Configuração inválida: " +
        result.error.issues.map((e) => e.path.join(".") + ": " + e.message).join("; "),
    );
  return result.data;
}

/** Never guess an architecture or a dynamic dimension. Resolve only unambiguous metadata. */
export function resolveModelConfig(
  config: ModelConfig,
  metadata: ModelMetadata,
): ResolvedModelConfig {
  if (metadata.inputs.length !== 1)
    throw new Error(
      "Este pipeline exige um único tensor de imagem. Adicione um adapter para entradas auxiliares.",
    );
  const input =
    metadata.inputs.find((i) => i.name === config.input.name) ??
    (!config.input.name ? metadata.inputs[0] : undefined);
  if (!input || input.type !== "float32" || input.shape.length !== 4)
    throw new Error("Entrada deve ser um tensor float32 NCHW de quatro dimensões.");
  const [batch, channels, h, w] = input.shape;
  if (
    (typeof batch === "number" && batch !== 1) ||
    (typeof channels === "number" && channels !== 3)
  )
    throw new Error("Entrada suportada: batch 1, três canais RGB (NCHW).");
  function dim(meta: number | string | undefined, configured: number | undefined, axis: string) {
    const fixed = typeof meta === "number" && meta > 0 ? meta : undefined;
    if (fixed && configured && fixed !== configured)
      throw new Error("Dimensão " + axis + " diverge do ONNX.");
    const resolved = fixed ?? configured;
    if (!resolved) throw new Error("Dimensão dinâmica " + axis + ": informe-a no JSON do modelo.");
    return resolved;
  }
  const result: ResolvedModelConfig = {
    ...config,
    input: {
      name: input.name,
      width: dim(w, config.input.width, "largura"),
      height: dim(h, config.input.height, "altura"),
    },
    output: { ...config.output },
  };
  if (config.adapter === "yolo") {
    const output =
      metadata.outputs.find((o) => o.name === config.output.name) ??
      (!config.output.name && metadata.outputs.length === 1 ? metadata.outputs[0] : undefined);
    if (!output || output.shape.length !== 3 || output.type !== "float32")
      throw new Error("Saída YOLO float32 ambígua ou ausente; informe output.name no JSON.");
    const stride = 4 + config.classes.length;
    const cf = output.shape[1] === stride,
      rows = output.shape[2] === stride;
    const layout =
      config.output.layout ?? (cf !== rows ? (cf ? "channels_first" : "rows") : undefined);
    if (
      !layout ||
      (layout === "channels_first" && typeof output.shape[1] === "number" && !cf) ||
      (layout === "rows" && typeof output.shape[2] === "number" && !rows)
    )
      throw new Error(
        "Layout YOLO incompatível/ambíguo. Esperado 4 + número de classes, sem objectness.",
      );
    result.output.name = output.name;
    result.output.layout = layout;
  } else {
    const boxes = metadata.outputs.find((o) => o.name === config.output.boxes);
    const scores = metadata.outputs.find((o) => o.name === config.output.scores);
    const nc = config.classes.length + (config.output.backgroundIndex === undefined ? 0 : 1);
    if (
      !boxes ||
      !scores ||
      boxes.type !== "float32" ||
      scores.type !== "float32" ||
      boxes.shape.length !== 3 ||
      boxes.shape[2] !== 4 ||
      scores.shape.length !== 3 ||
      scores.shape[2] !== nc
    )
      throw new Error(
        "Saídas por conjunto devem ser boxes [1,Q,4] e scores [1,Q,C], float32, conforme o JSON.",
      );
    if (
      typeof boxes.shape[1] === "number" &&
      typeof scores.shape[1] === "number" &&
      boxes.shape[1] !== scores.shape[1]
    )
      throw new Error("Quantidade de boxes e scores incompatível.");
    if (config.output.backgroundIndex !== undefined && config.output.backgroundIndex >= nc)
      throw new Error("backgroundIndex fora das classes de saída.");
  }
  return result;
}
