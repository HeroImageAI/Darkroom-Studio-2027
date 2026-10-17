import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import { paintStroke } from "../../apps/api/src/paint.js";
import { renderMaster } from "../../apps/api/src/edit-render.js";
let store: Store, root: string;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "paint-"));
  store = new Store(root);
});
afterEach(() => {
  store.db.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const project = store.createProject("Owned paint test");
  const asset = await store.importAsset(
    await sharp({
      create: { width: 64, height: 48, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer(),
    "source.png",
    project.id,
  );
  const doc = store.createDocument(project.id, asset.id);
  return { project, asset, doc };
}
it("paint and erase retain immutable sources, transparent surroundings and revision history", async () => {
  const { asset, doc } = await fixture(),
    original = store.assetBytes(asset.id);
  const request = {
    expectedRevision: doc.currentRevisionId,
    colour: "#e31824",
    size: 12,
    erase: false,
    points: [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
    ],
  };
  const painted = await paintStroke(store, doc.id, request);
  const pixels = await sharp(store.assetBytes(painted.id))
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect([
    ...pixels.subarray((20 * 64 + 30) * 4, (20 * 64 + 30) * 4 + 4),
  ]).toEqual([227, 24, 36, 255]);
  expect(pixels[3]).toBe(0);
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
  const layer = {
    ...doc.snapshot.layers[0]!,
    id: crypto.randomUUID(),
    name: "Guidance paint",
    type: "paint" as const,
    assetId: painted.id,
    locked: false,
  };
  const saved = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    layers: [...doc.snapshot.layers, layer],
  });
  const erased = await paintStroke(store, doc.id, {
    ...request,
    expectedRevision: saved.currentRevisionId,
    layerId: layer.id,
    erase: true,
    points: [{ x: 30, y: 20 }],
    size: 6,
  });
  const erasedPixels = await sharp(store.assetBytes(erased.id))
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(erasedPixels[(20 * 64 + 30) * 4 + 3]).toBe(0);
  expect(store.assetBytes(painted.id)).toEqual(
    await sharp(pixels, { raw: { width: 64, height: 48, channels: 4 } })
      .png()
      .toBuffer(),
  );
  const rendered = await sharp(await renderMaster(store, saved.snapshot))
    .raw()
    .toBuffer();
  expect([
    ...rendered.subarray((20 * 64 + 30) * 4, (20 * 64 + 30) * 4 + 4),
  ]).toEqual([227, 24, 36, 255]);
  expect(store.assetBytes(asset.id)).toEqual(original);
  await expect(paintStroke(store, doc.id, request)).rejects.toThrow(
    "Document changed",
  );
  await expect(
    paintStroke(store, doc.id, {
      ...request,
      expectedRevision: saved.currentRevisionId,
      layerId: doc.snapshot.layers[0]!.id,
    }),
  ).rejects.toThrow("unlocked paint layer");
});
it("paint refuses invalid colour, empty strokes and erase without a paint layer", async () => {
  const { doc } = await fixture();
  const r = {
    expectedRevision: doc.currentRevisionId,
    colour: "#000000",
    size: 10,
    erase: false,
    points: [{ x: 5, y: 5 }],
  };
  await expect(
    paintStroke(store, doc.id, { ...r, colour: "url(https://example.com)" }),
  ).rejects.toThrow();
  await expect(
    paintStroke(store, doc.id, { ...r, points: [] }),
  ).rejects.toThrow();
  await expect(
    paintStroke(store, doc.id, { ...r, erase: true }),
  ).rejects.toThrow("paint layer");
});
