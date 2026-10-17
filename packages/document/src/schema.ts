import { z } from "zod";
import { sanitizeSvg } from "./svg.js";
const transform = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    scaleX: z.number().positive(),
    scaleY: z.number().positive(),
    rotation: z.number().finite(),
  })
  .strict();
const base = {
  id: z.string().uuid(),
  name: z.string().max(200),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1),
  transform,
};
const point = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();
const maskStroke = z
  .object({
    points: z.array(point).min(1).max(2000),
    size: z.number().min(1).max(4096),
    reveal: z.boolean(),
  })
  .strict();
const raster = z
  .object({
    ...base,
    type: z.enum(["raster", "generated", "paint"]),
    assetId: z.string().uuid(),
    vectorSvg: z
      .string()
      .max(256000)
      .refine((s) => {
        try {
          sanitizeSvg(s);
          return true;
        } catch {
          return false;
        }
      }, "Unsupported SVG logo")
      .optional(),
    maskAssetId: z.string().uuid().optional(),
    maskStrokes: z.array(maskStroke).max(500).optional(),
  })
  .strict();
const text = z
  .object({
    ...base,
    type: z.literal("text"),
    text: z.string().max(10000),
    fontFamily: z.string(),
    fontSize: z.number().positive(),
    fill: z.string(),
  })
  .strict();
const vector = z
  .object({
    ...base,
    type: z.literal("vector"),
    shape: z.enum(["rectangle", "ellipse"]),
    width: z.number().positive(),
    height: z.number().positive(),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: z.number().nonnegative(),
  })
  .strict();
export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    colourSpace: z.literal("srgb"),
    layers: z.array(z.union([raster, text, vector])).max(100),
    selectionMaskAssetId: z.string().uuid().optional(),
    selection: z.array(point).min(3).max(2000).optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    if (doc.selection && doc.selectionMaskAssetId)
      ctx.addIssue({
        code: "custom",
        message: "Use one selection representation at a time",
      });
    const points = doc.layers.reduce(
      (sum, layer) =>
        sum +
        ("maskStrokes" in layer
          ? (layer.maskStrokes ?? []).reduce((n, s) => n + s.points.length, 0)
          : 0),
      doc.selection?.length ?? 0,
    );
    if (points > 20000)
      ctx.addIssue({
        code: "custom",
        message:
          "This master has reached its 20,000 editable mask/selection point limit. Clear unused masks or start a separate master.",
      });
    if (new Set(doc.layers.map((l) => l.id)).size !== doc.layers.length)
      ctx.addIssue({ code: "custom", message: "Layer IDs must be unique" });
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
export function initialSnapshot(
  id: string,
  asset: { id: string; width: number; height: number },
  layerId: string,
): Snapshot {
  return {
    schemaVersion: 1,
    id,
    width: asset.width,
    height: asset.height,
    colourSpace: "srgb",
    layers: [
      {
        id: layerId,
        name: "Original",
        type: "raster",
        assetId: asset.id,
        visible: true,
        locked: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      },
    ],
  };
}
