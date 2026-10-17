import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import {
  connectedSubject,
  prepareSelection,
  selectionPixels,
} from "../../apps/api/src/selection.js";
import { ComfyClient } from "../../apps/api/src/comfy.js";
import { prepareEdit, protectEdit } from "../../apps/api/src/edit-render.js";
import { renderDelivery } from "../../apps/api/src/branding.js";
import {
  createHandoff,
  handoffRecord,
  importProject,
} from "../../apps/api/src/handoff.js";
import { cropDocument } from "../../packages/document/src/edit.js";
import { finishOutput } from "../../apps/api/src/finish-workflows.js";
let store: Store, root: string;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync("data/tests/selection-");
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const project = store.createProject("Selection"),
    asset = await store.importAsset(
      await sharp({
        create: { width: 64, height: 64, channels: 4, background: "white" },
      })
        .png()
        .toBuffer(),
      "owned.png",
      project.id,
    );
  return store.createDocument(project.id, asset.id);
}
const polygon = [
  { x: 10, y: 10 },
  { x: 50, y: 10 },
  { x: 50, y: 50 },
  { x: 10, y: 50 },
];
it("click selection retains holes and isolates disconnected foreground subjects", () => {
  const mask = Buffer.from([255, 255, 0, 255, 255, 0, 0, 0, 255, 255, 255, 0]);
  expect([...connectedSubject(mask, 4, 3, { x: 0, y: 0 })]).toEqual([
    255, 255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
  ]);
  expect(() => connectedSubject(mask, 4, 3, { x: 2, y: 0 })).toThrow(
    "Click inside",
  );
});
it("add and subtract preserve holes, save/reload and protected pixels", async () => {
  let doc = await fixture();
  const client = new ComfyClient("http://127.0.0.1:8188", "");
  const first = await prepareSelection(store, client, doc.id, {
    expectedRevision: doc.currentRevisionId,
    mode: "replace",
    polygon,
  });
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: first.selectionMaskAssetId!,
  });
  const hole = await prepareSelection(store, client, doc.id, {
    expectedRevision: doc.currentRevisionId,
    mode: "subtract",
    polygon: [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 40 },
      { x: 20, y: 40 },
    ],
  });
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: hole.selectionMaskAssetId!,
  });
  const mask = await selectionPixels(store, store.document(doc.id)!.snapshot);
  expect(mask[30 * 64 + 30]).toBe(0);
  expect(mask[15 * 64 + 15]).toBe(255);
  const prepared = await prepareEdit(store, doc.snapshot, {
    task: "Instruct",
    area: "selection",
  } as any);
  const red = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  const result = await sharp(
    await protectEdit(prepared.source, prepared.maskPng, red),
  )
    .raw()
    .toBuffer();
  expect([
    ...result.subarray((30 * 64 + 30) * 4, (30 * 64 + 30) * 4 + 4),
  ]).toEqual([255, 255, 255, 255]);
  const added = await prepareSelection(store, client, doc.id, {
    expectedRevision: doc.currentRevisionId,
    mode: "add",
    polygon: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ],
  });
  expect(
    (
      await selectionPixels(store, {
        ...doc.snapshot,
        selectionMaskAssetId: added.selectionMaskAssetId!,
      })
    )[2 * 64 + 2],
  ).toBe(255);
  expect(
    cropDocument(doc.snapshot, { x: 0, y: 0, width: 32, height: 32 })
      .selectionMaskAssetId,
  ).toBeUndefined();
  await expect(
    prepareSelection(store, client, doc.id, {
      expectedRevision: randomUUID(),
      mode: "replace",
      polygon,
    }),
  ).rejects.toThrow("master changed");
});
it("native project carries selection masks under new asset IDs and rejects foreign assets", async () => {
  let doc = await fixture();
  const mask = await store.internalAsset(
    await sharp({
      create: { width: 64, height: 64, channels: 3, background: "white" },
    })
      .png()
      .toBuffer(),
    "mask.png",
    doc.projectId,
  );
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: mask.id,
  });
  const handoff = await createHandoff(store, {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    format: "darkroom",
    idempotencyKey: randomUUID(),
  });
  const bundle = JSON.parse(
    Buffer.from(
      handoffRecord(store, handoff.id)!.bytes as Uint8Array,
    ).toString(),
  );
  const copy = await importProject(store, {
    bundle,
    idempotencyKey: randomUUID(),
  });
  expect(copy.document.snapshot.selectionMaskAssetId).toBeTruthy();
  expect(
    store
      .assets(copy.project.id)
      .some((a) => a.id === copy.document.snapshot.selectionMaskAssetId),
  ).toBe(false);
  expect(await selectionPixels(store, copy.document.snapshot)).toEqual(
    await selectionPixels(store, doc.snapshot),
  );
  const other = await fixture();
  expect(() =>
    store.saveDocument(other.id, other.currentRevisionId, {
      ...other.snapshot,
      selectionMaskAssetId: mask.id,
    }),
  ).toThrow("outside this project");
});
it("AI inputs match exact branded delivery and retain editable source text", async () => {
  let doc = await fixture();
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selection: polygon,
    layers: [
      ...doc.snapshot.layers,
      {
        id: randomUUID(),
        name: "Exact lettering",
        type: "text",
        text: "NOIR",
        fontFamily: "Darkroom Sans Bold",
        fontSize: 12,
        fill: "#111111",
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      },
    ],
  });
  const prepared = await prepareEdit(store, doc.snapshot, {
    task: "Instruct",
    area: "selection",
  } as any);
  expect(await sharp(prepared.source).raw().toBuffer()).toEqual(
    await sharp(await renderDelivery(store, doc.snapshot))
      .raw()
      .toBuffer(),
  );
  expect(store.document(doc.id)!.snapshot.layers[1]).toMatchObject({
    type: "text",
    visible: true,
    text: "NOIR",
  });
});
it("protected Restore accepts a mask with holes and retains source alpha", async () => {
  const source = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 50, g: 60, b: 70, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const raw = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const mask = Buffer.alloc(64 * 64);
  mask[10 * 64 + 10] = 255;
  const png = await sharp(mask, { raw: { width: 64, height: 64, channels: 1 } })
    .png()
    .toBuffer();
  const result = await sharp(
    await finishOutput(source, raw, "Restore", 64, 64, undefined, png),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  const original = await sharp(source).ensureAlpha().raw().toBuffer();
  expect(result.subarray((10 * 64 + 10) * 4, (10 * 64 + 10) * 4 + 4)).toEqual(
    original.subarray((10 * 64 + 10) * 4, (10 * 64 + 10) * 4 + 4),
  );
  expect(result[3]).toBe(original[3]);
});

it("recolour does not blend the old colour back into selected boundaries", async () => {
  const { protectRequestedEdit } =
    await import("../../apps/api/src/edit-render.js");
  const source = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#ff8000" },
  })
    .png()
    .toBuffer();
  const generated = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#002080" },
  })
    .png()
    .toBuffer();
  const pixels = Buffer.alloc(64 * 64);
  for (let y = 10; y < 54; y++)
    for (let x = 10; x < 54; x++) pixels[y * 64 + x] = 255;
  const mask = await sharp(pixels, {
    raw: { width: 64, height: 64, channels: 1 },
  })
    .png()
    .toBuffer();
  const out = await sharp(
    await protectRequestedEdit(source, mask, generated, "Recolour"),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect([...out.subarray((10 * 64 + 10) * 4, (10 * 64 + 10) * 4 + 4)]).toEqual(
    [0, 32, 128, 255],
  );
  expect([...out.subarray((9 * 64 + 10) * 4, (9 * 64 + 10) * 4 + 4)]).toEqual([
    255, 128, 0, 255,
  ]);
});

it("selection brush can add and erase a single dab without changing the image", async () => {
  let doc = await fixture();
  const client = new ComfyClient("http://127.0.0.1:8188", "");
  const first = await prepareSelection(store, client, doc.id, {
    expectedRevision: doc.currentRevisionId,
    mode: "add",
    stroke: { points: [{ x: 20, y: 20 }], size: 10 },
  });
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    selectionMaskAssetId: first.selectionMaskAssetId!,
  });
  const pixels = await selectionPixels(store, doc.snapshot);
  expect(pixels[20 * 64 + 20]).toBe(255);
  expect(pixels[5 * 64 + 5]).toBe(0);
  const erased = await prepareSelection(store, client, doc.id, {
    expectedRevision: doc.currentRevisionId,
    mode: "subtract",
    stroke: { points: [{ x: 20, y: 20 }], size: 20 },
  });
  expect(erased.selectionMaskAssetId).toBeNull();
});
