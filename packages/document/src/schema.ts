import { z } from "zod";
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
const raster = z
  .object({
    ...base,
    type: z.enum(["raster", "generated", "paint"]),
    assetId: z.string().uuid(),
    maskAssetId: z.string().uuid().optional(),
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
  })
  .strict()
  .superRefine((doc, ctx) => {
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
