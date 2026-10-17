import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Store } from "./store.js";
import { Conflict } from "./store.js";
import type { ComfyClient } from "./comfy.js";
import { renderDelivery } from "./branding.js";
import { finishGraph, preflightFinish } from "./finish-workflows.js";
import { assertFinishReady } from "./finish-readiness.js";
import { selectionGraph, assertSelectionReady } from "./selection-workflow.js";
const point = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();
export const selectionRequest = z
  .object({
    expectedRevision: z.string().uuid(),
    mode: z.enum(["replace", "add", "subtract"]),
    subject: z.boolean().default(false),
    point: point.optional(),
    description: z.string().trim().min(1).max(120).optional(),
    stroke: z
      .object({
        points: z.array(point).min(1).max(2000),
        size: z.number().min(1).max(4096),
      })
      .strict()
      .optional(),
    polygon: z.array(point).min(3).max(2000).optional(),
  })
  .strict();
// Keep holes and disconnected regions; a selection is a mask, not a bounding box.
export function connectedSubject(
  mask: Buffer,
  width: number,
  height: number,
  p: { x: number; y: number },
) {
  const x = Math.floor(p.x),
    y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= width || y >= height || !mask[y * width + x])
    throw Error(
      "Click inside the foreground subject, or use Rectangle/Lasso to refine the selection.",
    );
  const result = Buffer.alloc(mask.length),
    queue = new Int32Array(mask.length);
  let start = 0,
    end = 0;
  const first = y * width + x;
  queue[end++] = first;
  result[first] = 255;
  while (start < end) {
    const i = queue[start++]!,
      px = i % width,
      py = Math.floor(i / width);
    const visit = (n: number) => {
      if (mask[n] && !result[n]) {
        result[n] = 255;
        queue[end++] = n;
      }
    };
    if (px) visit(i - 1);
    if (px + 1 < width) visit(i + 1);
    if (py) visit(i - width);
    if (py + 1 < height) visit(i + width);
  }
  return result;
}
export async function selectionPixels(
  store: Store,
  snapshot: import("../../../packages/document/src/schema.js").Snapshot,
) {
  const { width, height } = snapshot;
  if (snapshot.selectionMaskAssetId) {
    const image = sharp(store.assetBytes(snapshot.selectionMaskAssetId));
    const meta = await image.metadata();
    if (meta.width !== width || meta.height !== height)
      throw Error("Selection dimensions do not match the canvas");
    return image.removeAlpha().greyscale().threshold(128).raw().toBuffer();
  }
  if (!snapshot.selection) return Buffer.alloc(width * height);
  return polygonPixels(snapshot.selection, width, height);
}
async function polygonPixels(
  points: { x: number; y: number }[],
  width: number,
  height: number,
) {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><polygon points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="white"/></svg>`,
    ),
  )
    .removeAlpha()
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer();
}
const active = new WeakSet<ComfyClient>();
export async function prepareSelection(
  store: Store,
  client: ComfyClient,
  documentId: string,
  input: unknown,
) {
  const request = selectionRequest.parse(input),
    doc = store.document(documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== request.expectedRevision)
    throw new Conflict("The master changed; try selecting again.");
  const { width, height } = doc.snapshot;
  if (width * height > 16000000)
    throw Error("Selection supports canvases up to 16 million pixels");
  let candidate: Buffer;
  if (request.subject) {
    if (request.polygon || request.stroke)
      throw Error("Choose a subject or a manual outline");
    if (!request.point && !request.description)
      throw Error("Click an object or describe what to select");
    if (width > 2048 || height > 2048)
      throw Error(
        "Automatic subject selection currently supports up to 2048 pixels per side. Use Rectangle/Lasso for this master.",
      );
    if (active.has(client)) throw Error("Subject selection is already running");
    active.add(client);
    try {
      const inspection = await client.inspect();
      if (!inspection.status.verified)
        throw Error(
          "Start the verified local image engine before selecting a subject",
        );
      if (request.description)
        await assertSelectionReady(inspection.info, inspection.status.version);
      else
        await assertFinishReady(
          "Remove background",
          inspection.info,
          inspection.status.version,
        );
      const queue = await client.queue();
      if (queue.queue_running.length || queue.queue_pending.length)
        throw Error(
          "The image engine is busy. Try selecting when it finishes.",
        );
      const image = await client.uploadReference(
        await sharp(await renderDelivery(store, doc.snapshot))
          .flatten({ background: "white" })
          .png()
          .toBuffer(),
      );
      const graph = request.description
        ? selectionGraph(image, request.description)
        : finishGraph("Remove background", image);
      if (!request.description) preflightFinish(graph, inspection.info, image);
      const id = await client.submit(graph, randomUUID());
      const deadline = Date.now() + 120000;
      let output: Buffer | undefined;
      while (Date.now() < deadline) {
        const h = await client.history(id);
        if (h?.status?.status_str === "error")
          throw Error("Subject selection failed; the master is unchanged");
        if (h?.status?.completed) {
          const images = h.outputs?.["99"]?.images;
          if (images?.length !== 1) throw Error("Expected one subject mask");
          output = await client.image(images[0]);
          break;
        }
        await delay(250);
      }
      if (!output)
        throw Error("Subject selection timed out; the master is unchanged");
      const meta = await sharp(output).metadata();
      if (meta.width !== width || meta.height !== height)
        throw Error("Subject mask dimensions changed");
      candidate = await sharp(output)
        .removeAlpha()
        .greyscale()
        .threshold(128)
        .raw()
        .toBuffer();
      if (request.point)
        candidate = connectedSubject(candidate, width, height, request.point);
      if (!candidate.some((v) => v))
        throw Error(
          "No matching object found. Try another point or description.",
        );
    } finally {
      active.delete(client);
    }
  } else {
    if (request.stroke) {
      const { points, size } = request.stroke;
      const body =
        points.length === 1
          ? `<circle cx="${points[0]!.x}" cy="${points[0]!.y}" r="${size / 2}" fill="white"/>`
          : `<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="white" stroke-width="${size}" stroke-linecap="round" stroke-linejoin="round"/>`;
      candidate = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>${body}</svg>`,
        ),
      )
        .removeAlpha()
        .greyscale()
        .threshold(128)
        .raw()
        .toBuffer();
    } else {
      if (!request.polygon)
        throw Error("Draw a rectangle or lasso to refine the selection");
      candidate = await polygonPixels(request.polygon, width, height);
    }
  }
  const previous = await selectionPixels(store, doc.snapshot);
  if (request.mode !== "replace")
    for (let i = 0; i < candidate.length; i++)
      candidate[i] =
        request.mode === "add"
          ? Math.max(previous[i]!, candidate[i]!)
          : previous[i] && !candidate[i]
            ? 255
            : 0;
  if (
    store.document(documentId)!.currentRevisionId !== request.expectedRevision
  )
    throw new Conflict("The master changed during selection; try again.");
  if (!candidate.some((v) => v))
    return {
      expectedRevision: request.expectedRevision,
      selectionMaskAssetId: null,
    };
  const asset = await store.internalAsset(
    await sharp(candidate, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer(),
    "Selection mask.png",
    doc.projectId,
  );
  return {
    expectedRevision: request.expectedRevision,
    selectionMaskAssetId: asset.id,
  };
}
