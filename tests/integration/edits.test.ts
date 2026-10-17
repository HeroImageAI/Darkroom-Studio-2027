import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store, Conflict } from "../../apps/api/src/store.js";
import {
  editRow,
  reviewEdit,
  editPrompt,
  submitEdit,
} from "../../apps/api/src/edits.js";
import { ComfyClient } from "../../apps/api/src/comfy.js";
import { Worker } from "../../apps/api/src/worker.js";
import { workflowById } from "../../apps/api/src/workflow.js";
import {
  editSignature,
  assertEditReady,
} from "../../packages/routing/src/edit-policy.js";
import {
  prepareEdit,
  protectEdit,
  protectRequestedEdit,
  renderMaster,
} from "../../apps/api/src/edit-render.js";
import {
  editRequestSchema,
  type EditRequest,
} from "../../packages/contracts/src/edit.js";
let store: Store, root: string;
it("recolour matches background drift without restoring the old pigment", async () => {
  const width = 24,
    height = 24;
  const original = Buffer.alloc(width * height * 4);
  const generated = Buffer.alloc(original.length);
  const mask = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const object = x >= 8 && x < 16 && y >= 8 && y < 16;
      original.set(object ? [220, 80, 20, 255] : [120, 120, 120, 255], i * 4);
      generated.set(object ? [20, 60, 200, 255] : [130, 130, 130, 255], i * 4);
      if (x >= 4 && x < 20 && y >= 4 && y < 20) mask[i] = 255;
    }
  const png = (bytes: Buffer, channels: 1 | 4) =>
    sharp(bytes, { raw: { width, height, channels } }).png().toBuffer();
  const result = await sharp(
    await protectRequestedEdit(
      await png(original, 4),
      await png(mask, 1),
      await png(generated, 4),
      "Recolour",
    ),
  )
    .raw()
    .toBuffer();
  for (let i = 0; i < mask.length; i++)
    if (!mask[i])
      expect(result.subarray(i * 4, i * 4 + 4)).toEqual(
        original.subarray(i * 4, i * 4 + 4),
      );
  expect(Math.abs(result[(4 * width + 4) * 4]! - 120)).toBeLessThanOrEqual(1);
  const centre = (12 * width + 12) * 4;
  expect(result[centre + 2]! - result[centre]!).toBeGreaterThan(150);
  expect(result[centre]).toBeLessThan(25);
});
it("recolour preserves translucent coverage and empty pixels while changing selected colour", async () => {
  const width = 12,
    height = 1;
  const rgba = Buffer.alloc(width * 4);
  const mask = Buffer.alloc(width, 255);
  const alphas = [0, 1, 32, 64, 128, 192, 254, 255, 0, 64, 128, 255];
  for (let i = 0; i < width; i++) {
    rgba.set([220, 80, 20, alphas[i]!], i * 4);
    if (i >= 8) mask[i] = 0;
  }
  const source = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  // Opaque output models cannot author the original cutout alpha channel.
  const generated = await sharp({
    create: { width, height, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const after = await sharp(
    await protectRequestedEdit(source, maskPng, generated, "Recolour"),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let i = 0; i < width; i++) {
    expect(after[i * 4 + 3]).toBe(alphas[i]);
    if (mask[i] === 0 || alphas[i] === 0)
      expect(after.subarray(i * 4, i * 4 + 4)).toEqual(
        rgba.subarray(i * 4, i * 4 + 4),
      );
    else expect([...after.subarray(i * 4, i * 4 + 3)]).toEqual([0, 0, 255]);
  }
  // Replacement/background actions retain their existing ability to add opacity.
  const replacement = await sharp(
    await protectRequestedEdit(source, maskPng, generated, "Background"),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(replacement[3]).toBe(255);
});
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "edits-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const project = store.createProject("Edits"),
    bytes = await sharp({
      create: {
        width: 320,
        height: 256,
        channels: 4,
        background: { r: 200, g: 30, b: 40, alpha: 0.4 },
      },
    })
      .png()
      .toBuffer();
  const asset = await store.importAsset(bytes, "source.png", project.id),
    doc = store.createDocument(project.id, asset.id);
  const snapshot = {
    ...doc.snapshot,
    selection: [
      { x: 50, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 200 },
      { x: 50, y: 200 },
    ],
  };
  const request: EditRequest = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    instruction: "Remove exactly this. Keep NOIR unchanged.",
    task: "Remove",
    area: "selection",
    seed: 2027,
    idempotencyKey: randomUUID(),
  };
  return { project, bytes, asset, doc, snapshot, request };
}
it("protects every RGBA byte outside the selection and retains requested output size", async () => {
  const f = await fixture(),
    prepared = await prepareEdit(store, f.snapshot, f.request);
  const raw = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  const result = await protectEdit(prepared.source, prepared.maskPng, raw);
  const before = await sharp(prepared.source).ensureAlpha().raw().toBuffer(),
    after = await sharp(result).ensureAlpha().raw().toBuffer();
  const mask = await sharp(prepared.maskPng).greyscale().raw().toBuffer();
  let changed = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0)
      expect(after.subarray(i * 4, i * 4 + 4)).toEqual(
        before.subarray(i * 4, i * 4 + 4),
      );
    else if (
      !after
        .subarray(i * 4, i * 4 + 4)
        .equals(before.subarray(i * 4, i * 4 + 4))
    )
      changed = true;
  }
  expect(changed).toBe(true);
  expect(await sharp(result).metadata()).toMatchObject({
    width: 320,
    height: 256,
    hasAlpha: true,
  });
  expect(store.assetBytes(f.asset.id)).toEqual(f.bytes);
});
it("outside targeting reverses protection and expansion preserves all original pixels at their offset", async () => {
  const f = await fixture();
  const inside = await prepareEdit(store, f.snapshot, f.request),
    outside = await prepareEdit(store, f.snapshot, {
      ...f.request,
      area: "outside",
    });
  const a = await sharp(inside.maskPng).greyscale().raw().toBuffer(),
    b = await sharp(outside.maskPng).greyscale().raw().toBuffer();
  expect(a.every((v, i) => v + b[i]! === 255)).toBe(true);
  const expanded = await prepareEdit(store, f.snapshot, {
    ...f.request,
    task: "Expand",
    expand: { left: 16, right: 0, top: 32, bottom: 0 },
  });
  const raw = await sharp({
    create: { width: 336, height: 288, channels: 4, background: "green" },
  })
    .png()
    .toBuffer();
  const result = await protectEdit(expanded.source, expanded.maskPng, raw);
  const old = await sharp(expanded.source)
    .extract({ left: 16, top: 32, width: 320, height: 256 })
    .raw()
    .toBuffer();
  expect(
    await sharp(result)
      .extract({ left: 16, top: 32, width: 320, height: 256 })
      .raw()
      .toBuffer(),
  ).toEqual(old);
});
it("requires a selection for local actions and preserves the verbatim instruction separately", async () => {
  const f = await fixture();
  await expect(prepareEdit(store, f.doc.snapshot, f.request)).rejects.toThrow(
    "Select the area",
  );
  expect(editPrompt(f.request).endsWith(f.request.instruction)).toBe(true);
  expect(
    editRequestSchema.safeParse({ ...f.request, task: "Expand" }).success,
  ).toBe(false);
});
async function completed() {
  const f = await fixture(),
    p = await prepareEdit(store, f.snapshot, f.request);
  const source = await store.importAsset(p.source, "input", f.project.id),
    mask = await store.importAsset(p.maskPng, "mask", f.project.id),
    result = await store.importAsset(
      p.source,
      "result",
      f.project.id,
      "generated",
    );
  const j = store.enqueue(
    f.project.id,
    { prompt: editPrompt(f.request), width: 320, height: 256, seed: 2027 },
    randomUUID(),
  );
  store.db
    .prepare(
      "INSERT INTO edit_requests(jobId,documentId,baseRevisionId,requestJson,snapshotJson,sourceAssetId,maskAssetId,idempotencyKey,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      j.id,
      f.doc.id,
      f.doc.currentRevisionId,
      JSON.stringify(editRequestSchema.parse(f.request)),
      JSON.stringify(f.snapshot),
      source.id,
      mask.id,
      f.request.idempotencyKey,
      new Date().toISOString(),
    );
  store.completeJob(j.id, result.id);
  return { ...f, j, result };
}
it("accepts a result only explicitly, keeps source layers and makes review idempotent", async () => {
  const f = await completed();
  expect(store.document(f.doc.id)!.currentRevisionId).toBe(
    f.doc.currentRevisionId,
  );
  const r = reviewEdit(store, f.j.id, "accept");
  expect(r.acceptedDocumentId).toBe(f.doc.id);
  const saved = store.document(f.doc.id)!;
  expect(saved.snapshot.layers).toHaveLength(2);
  expect(saved.snapshot.layers[0]!.visible).toBe(false);
  expect(reviewEdit(store, f.j.id, "accept").versionId).toBe(r.versionId);
  expect(store.document(f.doc.id)!.currentRevisionId).toBe(
    saved.currentRevisionId,
  );
  expect(() => store.review(store.candidates()[0]!.id, "accept")).toThrow(
    "source master",
  );
});
it("a competing save prevents acceptance; a separate version preserves both masters", async () => {
  const f = await completed();
  store.saveDocument(f.doc.id, f.doc.currentRevisionId, {
    ...f.doc.snapshot,
    width: 300,
  });
  expect(() => reviewEdit(store, f.j.id, "accept")).toThrow(Conflict);
  const kept = reviewEdit(store, f.j.id, "keep-version");
  expect(kept.acceptedDocumentId).not.toBe(f.doc.id);
  expect(store.document(f.doc.id)!.snapshot.width).toBe(300);
  expect(store.document(kept.acceptedDocumentId!)!.snapshot.width).toBe(320);
  expect(store.document(kept.acceptedDocumentId!)!.originalAssetId).toBe(
    f.asset.id,
  );
});
it("rejection and reload retain the untouched master and recoverable result", async () => {
  const f = await completed();
  reviewEdit(store, f.j.id, "reject");
  store.close();
  store = new Store(root);
  expect(editRow(store, f.j.id)!.disposition).toBe("rejected");
  expect(store.job(f.j.id)!.resultId).toBe(f.result.id);
  expect(store.document(f.doc.id)!.currentRevisionId).toBe(
    f.doc.currentRevisionId,
  );
});
it("replays an accepted request without contacting the engine and rejects key reuse", async () => {
  const f = await completed(),
    offline = new ComfyClient("http://127.0.0.1:1", "not-running");
  expect((await submitEdit(store, offline, f.request)).jobId).toBe(f.j.id);
  await expect(
    submitEdit(store, offline, { ...f.request, instruction: "different" }),
  ).rejects.toThrow(Conflict);
  expect(store.jobs()).toHaveLength(1);
  expect(() => assertEditReady("Remove", "wrong-fingerprint")).toThrow(
    "not passed",
  );
});
it("recovers engine output through the same protected compositor without changing the master", async () => {
  const f = await completed();
  store.db.prepare("DELETE FROM candidates WHERE jobId=?").run(f.j.id);
  store.db.prepare("UPDATE jobs SET resultId=NULL WHERE id=?").run(f.j.id);
  const { graph } = workflowById("create.qwen.2ref");
  store.updateJob(f.j.id, "running", {
    promptId: "owned-test",
    provenance: JSON.stringify({
      graph,
      edit: { implementationSha256: editSignature() },
    }),
  });
  class Fake extends ComfyClient {
    override async inspect() {
      return {
        status: { connected: true, verified: true, url: this.url, models: {} },
        info: {},
      };
    }
    override async history() {
      return {
        status: { completed: true },
        outputs: { output: { images: [{}] } },
      };
    }
    override async image() {
      return sharp({
        create: { width: 320, height: 256, channels: 4, background: "blue" },
      })
        .png()
        .toBuffer();
    }
  }
  await new Worker(store, new Fake("http://127.0.0.1:8188", "test")).recover();
  expect(store.job(f.j.id)!.state).toBe("succeeded");
  const result = await sharp(store.assetBytes(store.job(f.j.id)!.resultId!))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const source = await sharp(
    store.assetBytes(editRow(store, f.j.id)!.sourceAssetId),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(result.subarray(0, 4)).toEqual(source.subarray(0, 4));
  expect(editRow(store, f.j.id)!.rawAssetId).toBeTruthy();
  expect(
    store
      .assets(f.project.id)
      .some((a) => a.id === editRow(store, f.j.id)!.rawAssetId),
  ).toBe(false);
  expect(store.document(f.doc.id)!.currentRevisionId).toBe(
    f.doc.currentRevisionId,
  );
});
it("server flattening respects layer opacity transforms visibility and hide masks", async () => {
  const f = await fixture();
  const layer = f.snapshot.layers[0]!;
  if (!("assetId" in layer)) throw Error("Raster expected");
  layer.opacity = 1;
  layer.maskStrokes = [
    { points: [{ x: 100, y: 100 }], size: 40, reveal: false },
  ];
  const rendered = await sharp(await renderMaster(store, f.snapshot))
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(rendered[(100 * 320 + 100) * 4 + 3]).toBe(0);
  expect(rendered[(10 * 320 + 10) * 4 + 3]).toBeGreaterThan(0);
  layer.visible = false;
  expect(
    (
      await sharp(await renderMaster(store, f.snapshot))
        .ensureAlpha()
        .raw()
        .toBuffer()
    ).every((v) => v === 0),
  ).toBe(true);
});
