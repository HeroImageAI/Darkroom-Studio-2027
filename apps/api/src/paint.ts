import sharp from "sharp";
import { z } from "zod";
import { Conflict, type Store } from "./store.js";

export const paintRequestSchema = z
  .object({
    expectedRevision: z.string().uuid(),
    layerId: z.string().uuid().optional(),
    colour: z.string().regex(/^#[a-f0-9]{6}$/i),
    erase: z.boolean(),
    size: z.number().min(1).max(512),
    points: z
      .array(
        z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();

// A stroke creates immutable raster bytes. The caller adds them to its normal
// editable snapshot, so Undo and autosave use the existing revision machinery.
export async function paintStroke(
  store: Store,
  documentId: string,
  input: unknown,
) {
  const request = paintRequestSchema.parse(input);
  const doc = store.document(documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== request.expectedRevision)
    throw new Conflict("Document changed; reload before painting.");
  const layer = request.layerId
    ? doc.snapshot.layers.find((l) => l.id === request.layerId)
    : undefined;
  if (request.layerId && (!layer || layer.type !== "paint" || layer.locked))
    throw Error("Choose an unlocked paint layer");
  if (!layer && request.erase)
    throw Error("Choose a paint layer before erasing");
  const base =
    layer && "assetId" in layer ? store.assetBytes(layer.assetId) : undefined;
  const meta = base ? await sharp(base).metadata() : doc.snapshot;
  const width = meta.width!,
    height = meta.height!;
  if (width * height > 16000000)
    throw Error("Guidance paint supports up to 16 million pixels");
  if (
    request.points.some((p) => Math.abs(p.x) > 32768 || Math.abs(p.y) > 32768)
  )
    throw Error("Paint stroke is outside the supported canvas area");
  const shape =
    request.points.length === 1
      ? `<circle cx="${request.points[0]!.x}" cy="${request.points[0]!.y}" r="${request.size / 2}" fill="${request.colour}"/>`
      : `<polyline points="${request.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${request.colour}" stroke-width="${request.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const stroke = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shape}</svg>`,
    ),
  )
    .png()
    .toBuffer();
  const image = base
    ? sharp(base)
    : sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      });
  const bytes = await image
    .composite([{ input: stroke, blend: request.erase ? "dest-out" : "over" }])
    .png()
    .toBuffer();
  if (
    store.document(documentId)!.currentRevisionId !== request.expectedRevision
  )
    throw new Conflict(
      "Document changed while painting. Your saved master is unchanged.",
    );
  return store.importAsset(
    bytes,
    "Guidance paint.png",
    doc.projectId,
    "generated",
  );
}
