import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import {
  exportRequestSchema,
  type ExportRequest,
  type ExportRecord,
} from "../../../packages/contracts/src/finish.js";
import { renderDelivery } from "./branding.js";
import { Conflict, type Store } from "./store.js";

export function exportHistory(
  store: Store,
  documentId: string,
): ExportRecord[] {
  return store.db
    .prepare(
      "SELECT recordJson FROM exports WHERE documentId=? ORDER BY createdAt DESC, rowid DESC",
    )
    .all(documentId)
    .map((r) => JSON.parse(String(r.recordJson)));
}
export function exportRecord(
  store: Store,
  id: string,
): ExportRecord | undefined {
  const row = store.db
    .prepare("SELECT recordJson FROM exports WHERE id=?")
    .get(id);
  return row ? JSON.parse(String(row.recordJson)) : undefined;
}
// Delivery resizing is explicit interpolation. It does not claim to restore missing detail.
export async function renderExport(source: Buffer, request: ExportRequest) {
  const r = exportRequestSchema.parse(request);
  let image = sharp(source)
    .resize(r.width, r.height, { fit: "fill", kernel: "lanczos3" })
    .toColourspace("srgb");
  if (!r.transparent) image = image.flatten({ background: r.background });
  image = image.withIccProfile("srgb").withMetadata({ density: r.density });
  return r.format === "png"
    ? image.png({ compressionLevel: 9 }).toBuffer()
    : image.jpeg({ quality: r.quality, chromaSubsampling: "4:4:4" }).toBuffer();
}
export async function createExport(
  store: Store,
  input: ExportRequest,
): Promise<ExportRecord> {
  const r = exportRequestSchema.parse(input),
    requestJson = JSON.stringify(r);
  function replay() {
    const row = store.db
      .prepare(
        "SELECT requestJson, recordJson FROM exports WHERE idempotencyKey=?",
      )
      .get(r.idempotencyKey);
    if (!row) return undefined;
    if (row.requestJson !== requestJson)
      throw new Conflict("Export retry settings changed. Start a new export.");
    return JSON.parse(String(row.recordJson)) as ExportRecord;
  }
  const previous = replay();
  if (previous) return previous;
  const doc = store.document(r.documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== r.expectedRevision)
    throw new Conflict("Master changed. Save and export its current revision.");
  const bytes = await renderExport(await renderDelivery(store, doc.snapshot), r);
  const id = randomUUID(),
    filename = `darkroom-${r.width}x${r.height}-${id.slice(0, 8)}.${r.format === "jpeg" ? "jpg" : "png"}`;
  const asset = await store.internalAsset(bytes, filename, doc.projectId);
  return store.transaction(() => {
    const concurrent = replay();
    if (concurrent) return concurrent;
    if (store.document(doc.id)!.currentRevisionId !== r.expectedRevision)
      throw new Conflict(
        "Master changed during export. Save and export again.",
      );
    const record: ExportRecord = {
      id,
      documentId: doc.id,
      revisionId: r.expectedRevision,
      assetId: asset.id,
      filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: r.width,
      height: r.height,
      format: r.format,
      transparent: r.transparent,
      createdAt: new Date().toISOString(),
    };
    store.db
      .prepare("INSERT INTO exports VALUES(?,?,?,?,?,?,?,?)")
      .run(
        id,
        doc.id,
        r.expectedRevision,
        asset.id,
        requestJson,
        JSON.stringify(record),
        r.idempotencyKey,
        record.createdAt,
      );
    return record;
  });
}
