import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import {
  prepareArtwork,
  artworkHistory,
  reviewArtwork,
} from "../../apps/api/src/artwork.js";
import {
  createHandoff,
  handoffRecord,
  importProject,
} from "../../apps/api/src/handoff.js";
import { renderDelivery } from "../../apps/api/src/branding.js";
let store: Store, root: string;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync("data/tests/artwork-");
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      pixels.set([x * 3, y * 3, 100, x < 12 ? 100 : 255], (y * 64 + x) * 4);
  const bytes = await sharp(pixels, {
    raw: { width: 64, height: 64, channels: 4 },
  })
    .png()
    .toBuffer();
  const project = store.createProject("Owned artwork");
  const asset = await store.importAsset(bytes, "Owned artwork.png", project.id);
  return { doc: store.createDocument(project.id, asset.id), bytes };
}
const corners = [
  { x: 8, y: 8 },
  { x: 39, y: 8 },
  { x: 39, y: 39 },
  { x: 8, y: 39 },
];
it("previews without changing the master, saves a separate editable copy and survives native handoff", async () => {
  const { doc, bytes } = await fixture();
  const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    idempotencyKey: randomUUID(),
  };
  const preview = await prepareArtwork(store, request);
  expect(preview.disposition).toBe("candidate");
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
  expect(
    store.assets(doc.projectId).some((a) => a.id === preview.assetId),
  ).toBe(false);
  const expected = await sharp(await renderDelivery(store, doc.snapshot))
    .extract({ left: 8, top: 8, width: 32, height: 32 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(
    await sharp(store.assetBytes(preview.assetId))
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ).toEqual(expected);
  store.close();
  store = new Store(root);
  expect(artworkHistory(store, doc.id)[0]!.id).toBe(preview.id);
  const record = reviewArtwork(store, preview.id, "save-copy");
  const copy = store.document(record.savedDocumentId!)!;
  expect(copy.id).not.toBe(doc.id);
  expect(copy.originalAssetId).toBe(doc.originalAssetId);
  expect(copy.snapshot.layers[0]!.visible).toBe(false);
  expect(copy.snapshot.layers[1]!.name).toBe("Straightened artwork · raster");
  expect(store.assetBytes(doc.originalAssetId)).toEqual(bytes);
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
  expect(reviewArtwork(store, preview.id, "save-copy").savedDocumentId).toBe(
    copy.id,
  );
  const handoff = await createHandoff(store, {
    documentId: copy.id,
    expectedRevision: copy.currentRevisionId,
    format: "darkroom",
    idempotencyKey: randomUUID(),
  });
  const bundle = JSON.parse(
    Buffer.from(
      handoffRecord(store, handoff.id)!.bytes as Uint8Array,
    ).toString(),
  );
  const imported = await importProject(store, {
    bundle,
    idempotencyKey: randomUUID(),
  });
  expect(await renderDelivery(store, imported.document.snapshot)).toEqual(
    await renderDelivery(store, copy.snapshot),
  );
});
it("replays concurrent previews and rejects changed retry settings or stale source revisions", async () => {
  const { doc } = await fixture();
  const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    idempotencyKey: randomUUID(),
  };
  const [a, b] = await Promise.all([
    prepareArtwork(store, request),
    prepareArtwork(store, request),
  ]);
  expect(a.id).toBe(b.id);
  expect(artworkHistory(store, doc.id)).toHaveLength(1);
  await expect(
    prepareArtwork(store, { ...request, width: 33 }),
  ).rejects.toThrow("retry settings changed");
  store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    layers: doc.snapshot.layers.map((l) => ({ ...l, name: "Changed" })),
  });
  await expect(
    prepareArtwork(store, { ...request, idempotencyKey: randomUUID() }),
  ).rejects.toThrow("Master changed");
  // Saving the frozen preview as a new master remains safe after source changes.
  expect(reviewArtwork(store, a.id, "save-copy").savedDocumentId).toBeTruthy();
});
it("keeps rejected artwork out of ordinary assets and never turns it into a master", async () => {
  const { doc } = await fixture();
  const preview = await prepareArtwork(store, {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    idempotencyKey: randomUUID(),
  });
  expect(reviewArtwork(store, preview.id, "reject").disposition).toBe(
    "rejected",
  );
  expect(reviewArtwork(store, preview.id, "reject").disposition).toBe(
    "rejected",
  );
  expect(() => reviewArtwork(store, preview.id, "save-copy")).toThrow(
    "already reviewed",
  );
  expect(store.documents(doc.projectId)).toHaveLength(1);
  expect(
    store.assets(doc.projectId).some((a) => a.id === preview.assetId),
  ).toBe(false);
});
it("refuses a damaged preview before creating a copy", async () => {
  const { doc, bytes } = await fixture();
  const preview = await prepareArtwork(store, {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    idempotencyKey: randomUUID(),
  });
  writeFileSync(
    join(root, store.asset(preview.assetId)!.path),
    Buffer.from("damaged preview"),
  );
  expect(() => reviewArtwork(store, preview.id, "save-copy")).toThrow(
    "integrity check failed",
  );
  expect(store.documents(doc.projectId)).toHaveLength(1);
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
  expect(store.assetBytes(doc.originalAssetId)).toEqual(bytes);
});
it("isolates selection holes and disconnected regions while retaining selected colour and source alpha", async () => {
  let { doc } = await fixture();
  const mask = Buffer.alloc(64 * 64);
  for (let y = 8; y < 40; y++)
    for (let x = 8; x < 40; x++)
      if (
        (x < 24 && !(x >= 14 && x <= 18 && y >= 14 && y <= 18)) ||
        (x >= 32 && y >= 30)
      )
        mask[y * 64 + x] = 255;
  const asset = await store.internalAsset(
    await sharp(mask, { raw: { width: 64, height: 64, channels: 1 } })
      .png()
      .toBuffer(),
    "Owned selection.png",
    doc.projectId,
  );
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: asset.id,
  });
  const source = await sharp(await renderDelivery(store, doc.snapshot))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    useSelection: true,
    idempotencyKey: randomUUID(),
  };
  const preview = await prepareArtwork(store, request);
  expect(preview.selectionMaskHash).toMatch(/^[a-f0-9]{64}$/);
  const output = await sharp(store.assetBytes(preview.assetId))
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dst = (y * 32 + x) * 4,
        src = ((y + 8) * 64 + x + 8) * 4;
      expect(output[dst + 3]).toBe(
        mask[(y + 8) * 64 + x + 8] ? source[src + 3] : 0,
      );
      if (output[dst + 3])
        expect(output.subarray(dst, dst + 3)).toEqual(
          source.subarray(src, src + 3),
        );
    }
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
  expect((await prepareArtwork(store, request)).id).toBe(preview.id);
});
it("rejects missing or empty isolation selections instead of returning an opaque or empty result", async () => {
  let { doc } = await fixture();
  const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    useSelection: true,
    idempotencyKey: randomUUID(),
  };
  await expect(prepareArtwork(store, request)).rejects.toThrow(
    "Select the artwork",
  );
  const empty = await store.internalAsset(
    await sharp({
      create: { width: 64, height: 64, channels: 3, background: "black" },
    })
      .png()
      .toBuffer(),
    "Empty selection.png",
    doc.projectId,
  );
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: empty.id,
  });
  await expect(
    prepareArtwork(store, {
      ...request,
      expectedRevision: doc.currentRevisionId,
    }),
  ).rejects.toThrow("contains no artwork");
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: undefined,
    selection: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ],
  });
  await expect(
    prepareArtwork(store, {
      ...request,
      expectedRevision: doc.currentRevisionId,
    }),
  ).rejects.toThrow("inside the marked corners");
  expect(artworkHistory(store, doc.id)).toHaveLength(0);
});
it("keeps legacy preview retries without an isolation field compatible", async () => {
  const { doc } = await fixture();
  const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    corners,
    width: 32,
    height: 32,
    idempotencyKey: randomUUID(),
  };
  const preview = await prepareArtwork(store, request);
  // Model the persisted pre-isolation request format explicitly.
  store.db
    .prepare("UPDATE artwork_extractions SET requestJson=? WHERE id=?")
    .run(JSON.stringify(request), preview.id);
  store.close();
  store = new Store(root);
  expect((await prepareArtwork(store, request)).id).toBe(preview.id);
  expect(preview.selectionMaskHash).toBeUndefined();
});
