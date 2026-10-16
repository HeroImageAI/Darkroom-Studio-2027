import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { snapshotSchema } from "../../../packages/document/src/schema.js";
import { Conflict, type Store } from "./store.js";
import { documentSvg, fontIdentity, textOutline } from "./branding.js";
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const requestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevision: z.string().uuid(),
    format: z.enum(["svg", "darkroom"]),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type HandoffRecord = {
  id: string;
  documentId: string;
  revisionId: string;
  format: "svg" | "darkroom";
  filename: string;
  sha256: string;
  rasterImages: number;
  createdAt: string;
};
export function handoffHistory(store: Store, id: string): HandoffRecord[] {
  return store.db
    .prepare(
      "SELECT recordJson FROM handoffs WHERE documentId=? ORDER BY rowid DESC",
    )
    .all(id)
    .map((r) => JSON.parse(String(r.recordJson)));
}
export function handoffRecord(store: Store, id: string) {
  return store.db.prepare("SELECT * FROM handoffs WHERE id=?").get(id);
}
export async function createHandoff(
  store: Store,
  input: unknown,
): Promise<HandoffRecord> {
  const r = requestSchema.parse(input),
    requestJson = JSON.stringify(r);
  function replay() {
    const found = store.db
      .prepare(
        "SELECT requestJson,recordJson FROM handoffs WHERE idempotencyKey=?",
      )
      .get(r.idempotencyKey);
    if (found) {
      if (found.requestJson !== requestJson)
        throw new Conflict("Handoff retry settings changed");
      return JSON.parse(String(found.recordJson)) as HandoffRecord;
    }
  }
  const previous = replay();
  if (previous) return previous;
  const doc = store.document(r.documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== r.expectedRevision)
    throw new Conflict(
      "Master changed. Save and prepare its current revision.",
    );
  let bytes: Buffer,
    rasterImages = 0;
  if (r.format === "svg") {
    ({ bytes, rasterImages } = await documentSvg(store, doc.snapshot));
  } else {
    for (const l of doc.snapshot.layers) if (l.type === "text") textOutline(l);
    const ids = [
      ...new Set([
        doc.originalAssetId,
        ...doc.snapshot.layers.flatMap((l) =>
          "assetId" in l
            ? [l.assetId, ...(l.maskAssetId ? [l.maskAssetId] : [])]
            : [],
        ),
      ]),
    ];
    let decodedBytes = 0;
    const bundle = {
      format: "darkroom-project",
      version: 1,
      name: store.project(doc.projectId)!.name,
      originalAssetId: doc.originalAssetId,
      snapshot: doc.snapshot,
      fonts: fontIdentity(),
      assets: ids.map((id) => {
        const a = store.asset(id)!;
        const imageBytes = store.assetBytes(id);
        decodedBytes += imageBytes.length;
        if (decodedBytes > 20 * 1024 * 1024)
          throw Error(
            "Project copy exceeds the 20 MB image limit required for reopening. Use a smaller master.",
          );
        if (hash(imageBytes) !== a.hash)
          throw Error(
            "Project source checksum failed. The saved source needs recovery before exporting.",
          );
        return {
          id,
          name: a.name,
          hash: a.hash,
          origin: a.origin,
          base64: imageBytes.toString("base64"),
        };
      }),
    };
    bytes = Buffer.from(JSON.stringify(bundle));
  }
  if (bytes.length > 30 * 1024 * 1024)
    throw Error("Handoff exceeds 30 MB. Use a smaller master.");
  return store.transaction(() => {
    const existing = replay();
    if (existing) return existing;
    if (store.document(doc.id)!.currentRevisionId !== r.expectedRevision)
      throw new Conflict("Master changed during handoff preparation");
    const id = randomUUID(),
      record: HandoffRecord = {
        id,
        documentId: doc.id,
        revisionId: r.expectedRevision,
        format: r.format,
        filename: `darkroom-${id.slice(0, 8)}.${r.format === "svg" ? "svg" : "darkroom.json"}`,
        sha256: hash(bytes),
        rasterImages,
        createdAt: new Date().toISOString(),
      };
    store.db
      .prepare("INSERT INTO handoffs VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        doc.id,
        r.expectedRevision,
        r.format,
        record.filename,
        record.sha256,
        bytes,
        JSON.stringify(record),
        requestJson,
        r.idempotencyKey,
      );
    return record;
  });
}
const bundleSchema = z
  .object({
    format: z.literal("darkroom-project"),
    version: z.literal(1),
    name: z.string().max(200),
    originalAssetId: z.string().uuid(),
    snapshot: snapshotSchema,
    fonts: z.record(z.string(), z.string()),
    assets: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().max(200),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            origin: z.enum(["import", "generated"]),
            base64: z.string().max(30 * 1024 * 1024),
          })
          .strict(),
      )
      .min(1)
      .max(201),
  })
  .strict();
const importSchema = z
  .object({ bundle: bundleSchema, idempotencyKey: z.string().uuid() })
  .strict();
type ImportedProject = {
  project: NonNullable<ReturnType<Store["project"]>>;
  document: NonNullable<ReturnType<Store["document"]>>;
};
const imports = new WeakMap<
  Store,
  Map<string, { sha256: string; promise: Promise<ImportedProject> }>
>();
export async function importProject(
  store: Store,
  input: unknown,
): Promise<ImportedProject> {
  const request = importSchema.parse(input),
    digest = hash(JSON.stringify(request.bundle));
  let active = imports.get(store);
  if (!active) {
    active = new Map();
    imports.set(store, active);
  }
  const existing = active.get(request.idempotencyKey);
  if (existing) {
    if (existing.sha256 !== digest)
      throw new Conflict("Project import retry changed");
    return existing.promise;
  }
  if (active.size >= 2)
    throw Error("Wait for the current project imports to finish");
  const promise = importProjectData(store, request).finally(() =>
    active!.delete(request.idempotencyKey),
  );
  active.set(request.idempotencyKey, { sha256: digest, promise });
  return promise;
}
async function importProjectData(
  store: Store,
  request: z.infer<typeof importSchema>,
): Promise<ImportedProject> {
  const bundle = request.bundle,
    sha256 = hash(JSON.stringify(bundle));
  function replay() {
    const r = store.db
      .prepare("SELECT * FROM project_imports WHERE idempotencyKey=?")
      .get(request.idempotencyKey);
    if (r) {
      if (r.sha256 !== sha256)
        throw new Conflict("Project import retry changed");
      return {
        project: store.project(String(r.projectId))!,
        document: store.document(String(r.documentId))!,
      };
    }
  }
  const found = replay();
  if (found) return found;
  if (new Set(bundle.assets.map((a) => a.id)).size !== bundle.assets.length)
    throw Error("Duplicate bundled asset");
  if (bundle.snapshot.layers.some((l) => l.type === "text")) {
    const current = fontIdentity();
    for (const l of bundle.snapshot.layers)
      if (l.type === "text") {
        if (bundle.fonts[l.fontFamily] !== current[l.fontFamily])
          throw Error(
            "Bundled font identity does not match. No font substitution was made.",
          );
        textOutline(l);
      }
  }
  const required = new Set([
    bundle.originalAssetId,
    ...bundle.snapshot.layers.flatMap((l) =>
      "assetId" in l
        ? [l.assetId, ...(l.maskAssetId ? [l.maskAssetId] : [])]
        : [],
    ),
  ]);
  if (
    required.size !== bundle.assets.length ||
    bundle.assets.some((a) => !required.has(a.id))
  )
    throw Error(
      "Project asset references are incomplete or contain unrelated files",
    );
  const decoded: Buffer[] = [];
  let total = 0;
  for (const a of bundle.assets) {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        a.base64,
      )
    )
      throw Error("Invalid bundled image encoding");
    const bytes = Buffer.from(a.base64, "base64");
    total += bytes.length;
    if (total > 20 * 1024 * 1024 || hash(bytes) !== a.hash)
      throw Error("Project image checksum or 20 MB image limit failed");
    const image = sharp(bytes, {
        limitInputPixels: 40000000,
        failOn: "warning",
      }),
      meta = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      throw Error("Unsupported project image");
    await image.stats();
    decoded.push(bytes);
  }
  const again = replay();
  if (again) return again;
  // All content is validated before creating a new project. Existing work is never replaced.
  const project = store.createProject(
      bundle.name.slice(0, 180) + " · imported",
    ),
    ids = new Map<string, string>();
  for (let i = 0; i < bundle.assets.length; i++) {
    const a = bundle.assets[i]!;
    const imported = await store.importAsset(
      decoded[i]!,
      a.name,
      project.id,
      a.origin,
    );
    ids.set(a.id, imported.id);
  }
  const initial = store.createDocument(
    project.id,
    ids.get(bundle.originalAssetId)!,
  );
  const snapshot = {
    ...bundle.snapshot,
    id: initial.id,
    layers: bundle.snapshot.layers.map((l) => ({
      ...l,
      id: randomUUID(),
      ...("assetId" in l
        ? {
            assetId: ids.get(l.assetId)!,
            maskAssetId: l.maskAssetId ? ids.get(l.maskAssetId) : undefined,
          }
        : {}),
    })),
  };
  const document = store.saveDocument(
    initial.id,
    initial.currentRevisionId,
    snapshot,
  );
  store.db
    .prepare("INSERT INTO project_imports VALUES(?,?,?,?)")
    .run(request.idempotencyKey, sha256, project.id, document.id);
  return { project, document };
}
