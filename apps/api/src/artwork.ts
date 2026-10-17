import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  artworkRequestSchema,
  type ArtworkRecord,
} from "../../../packages/contracts/src/artwork.js";
import { straightenRgba } from "../../../packages/document/src/perspective.js";
import { snapshotSchema } from "../../../packages/document/src/schema.js";
import { renderDelivery } from "./branding.js";
import { Conflict, type Store } from "./store.js";
import { selectionPixels } from "./selection.js";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export function artworkHistory(
  store: Store,
  documentId: string,
): ArtworkRecord[] {
  return store.db
    .prepare(
      "SELECT recordJson FROM artwork_extractions WHERE documentId=? ORDER BY rowid DESC",
    )
    .all(documentId)
    .map((r) => JSON.parse(String(r.recordJson)));
}
export async function prepareArtwork(
  store: Store,
  input: unknown,
): Promise<ArtworkRecord> {
  const request = artworkRequestSchema.parse(input),
    requestJson = JSON.stringify(request);
  function replay() {
    const row = store.db
      .prepare(
        "SELECT requestJson,recordJson FROM artwork_extractions WHERE idempotencyKey=?",
      )
      .get(request.idempotencyKey);
    if (!row) return;
    if (row.requestJson !== requestJson)
      throw new Conflict("Artwork retry settings changed");
    return JSON.parse(String(row.recordJson)) as ArtworkRecord;
  }
  const previous = replay();
  if (previous) return previous;
  const doc = store.document(request.documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== request.expectedRevision)
    throw new Conflict("Master changed; save before preparing artwork");
  if (doc.snapshot.layers.length >= 100)
    throw Error("This master needs one free layer slot for the artwork copy");
  const source = await renderDelivery(store, doc.snapshot);
  const pixels = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let selectionMaskHash: string | undefined;
  if (request.useSelection) {
    if (!doc.snapshot.selection && !doc.snapshot.selectionMaskAssetId)
      throw Error("Select the artwork to keep before isolating it");
    const mask = await selectionPixels(store, doc.snapshot);
    if (!mask.some((value) => value > 0))
      throw Error("The selection contains no artwork pixels");
    selectionMaskHash = hash(mask);
    for (let i = 0; i < mask.length; i++)
      pixels.data[i * 4 + 3] = Math.round(
        (pixels.data[i * 4 + 3]! * mask[i]!) / 255,
      );
  }
  const output = straightenRgba(
    pixels.data,
    pixels.info.width,
    pixels.info.height,
    request.corners,
    request.width,
    request.height,
  );
  if (request.useSelection) {
    let visible = false;
    for (let i = 3; i < output.length; i += 4)
      if (output[i]) {
        visible = true;
        break;
      }
    if (!visible)
      throw Error(
        "No visible selected artwork falls inside the marked corners",
      );
  }
  const png = await sharp(output, {
    raw: { width: request.width, height: request.height, channels: 4 },
  })
    .png()
    .toBuffer();
  if (store.document(doc.id)?.currentRevisionId !== request.expectedRevision)
    throw new Conflict("Master changed while preparing artwork; try again");
  const asset = await store.internalAsset(
    png,
    request.useSelection ? "Isolated artwork.png" : "Straightened artwork.png",
    doc.projectId,
  );
  return store.transaction(() => {
    const completed = replay();
    if (completed) return completed;
    if (store.document(doc.id)?.currentRevisionId !== request.expectedRevision)
      throw new Conflict("Master changed while preparing artwork; try again");
    const record: ArtworkRecord = {
      id: randomUUID(),
      documentId: doc.id,
      revisionId: request.expectedRevision,
      assetId: asset.id,
      width: request.width,
      height: request.height,
      sourceHash: hash(source),
      outputHash: hash(png),
      corners: request.corners,
      ...(selectionMaskHash ? { selectionMaskHash } : {}),
      disposition: "candidate",
      createdAt: new Date().toISOString(),
    };
    store.db
      .prepare("INSERT INTO artwork_extractions VALUES(?,?,?,?,?,?,?,?)")
      .run(
        record.id,
        doc.id,
        record.revisionId,
        asset.id,
        JSON.stringify(doc.snapshot),
        requestJson,
        JSON.stringify(record),
        request.idempotencyKey,
      );
    return record;
  });
}
export function reviewArtwork(
  store: Store,
  id: string,
  action: "save-copy" | "reject",
): ArtworkRecord {
  return store.transaction(() => {
    const row = store.db
      .prepare("SELECT * FROM artwork_extractions WHERE id=?")
      .get(id);
    if (!row) throw Error("Artwork preview not found");
    const record = JSON.parse(String(row.recordJson)) as ArtworkRecord;
    if (record.disposition !== "candidate") {
      if ((action === "save-copy") !== (record.disposition === "saved"))
        throw new Conflict("Artwork preview was already reviewed");
      return record;
    }
    if (action === "reject") record.disposition = "rejected";
    else {
      if (hash(store.assetBytes(record.assetId)) !== record.outputHash)
        throw Error(
          "Artwork preview integrity check failed; the source master is unchanged",
        );
      const original = store.document(record.documentId)!;
      const base = snapshotSchema.parse(JSON.parse(String(row.snapshotJson)));
      const target = store.createDocument(
        original.projectId,
        original.originalAssetId,
      );
      const { selection: _, selectionMaskAssetId: _mask, ...rest } = base;
      const saved = store.saveDocument(target.id, target.currentRevisionId, {
        ...rest,
        id: target.id,
        width: record.width,
        height: record.height,
        layers: [
          ...base.layers.map((l) => ({ ...l, visible: false })),
          {
            id: randomUUID(),
            name: record.selectionMaskHash
              ? "Isolated artwork · raster"
              : "Straightened artwork · raster",
            type: "raster",
            assetId: record.assetId,
            visible: true,
            locked: false,
            opacity: 1,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          },
        ],
      });
      store.version(
        saved.id,
        record.selectionMaskHash ? "Isolated artwork" : "Straightened artwork",
        saved.currentRevisionId,
      );
      store.db
        .prepare(
          "UPDATE project_assets SET role='result' WHERE projectId=? AND assetId=?",
        )
        .run(original.projectId, record.assetId);
      record.disposition = "saved";
      record.savedDocumentId = saved.id;
    }
    store.db
      .prepare("UPDATE artwork_extractions SET recordJson=? WHERE id=?")
      .run(JSON.stringify(record), id);
    return record;
  });
}
