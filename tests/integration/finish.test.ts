import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import {
  createExport,
  exportHistory,
  renderExport,
} from "../../apps/api/src/finish.js";
import {
  exportRequestSchema,
  type ExportRequest,
} from "../../packages/contracts/src/finish.js";
import { createApp } from "../../apps/api/src/app.js";
let root: string, store: Store;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "finish-"));
  store = new Store(root);
});
afterEach(() => {
  store.db.close();
  rmSync(root, { recursive: true, force: true });
});
async function fixture() {
  const project = store.createProject("Finish fixture");
  const source = await sharp(
    Buffer.from(
      '<svg width="80" height="60"><rect x="20" y="10" width="40" height="40" fill="#e40024"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const asset = await store.importAsset(source, "owned.png", project.id);
  const doc = store.createDocument(project.id, asset.id);
  const request: ExportRequest = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    idempotencyKey: randomUUID(),
    format: "png",
    width: 80,
    height: 60,
    transparent: true,
    background: "#ffffff",
    quality: 95,
    density: 300,
  };
  return { source, asset, doc, request };
}
it("exports the visible master, preserves alpha and source bytes, records immutable revision provenance", async () => {
  const { source, asset, doc, request } = await fixture();
  const snapshot = structuredClone(doc.snapshot);
  snapshot.layers[0]!.opacity = 0.5;
  const changed = store.saveDocument(doc.id, doc.currentRevisionId, snapshot);
  request.expectedRevision = changed.currentRevisionId;
  const result = await createExport(store, request),
    bytes = store.assetBytes(result.assetId);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.width).toBe(80);
  expect(info.height).toBe(60);
  expect(data[3]).toBe(0);
  expect(data[(30 * 80 + 40) * 4 + 3]).toBeCloseTo(128, 0);
  expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(store.assetBytes(asset.id)).toEqual(source);
  expect(store.document(doc.id)!.currentRevisionId).toBe(
    changed.currentRevisionId,
  );
  expect(exportHistory(store, doc.id)[0]!.revisionId).toBe(
    changed.currentRevisionId,
  );
  expect(store.assets(doc.projectId).some((a) => a.id === result.assetId)).toBe(
    false,
  );
  const meta = await sharp(bytes).metadata();
  expect(meta.density).toBe(300);
  expect(meta.icc?.length).toBeGreaterThan(0);
});
it.each([2, 4])(
  "resizes alpha to %ix with exact output dimensions",
  async (scale) => {
    const { request } = await fixture();
    request.width *= scale;
    request.height *= scale;
    const result = await createExport(store, request),
      meta = await sharp(store.assetBytes(result.assetId)).metadata();
    expect([meta.width, meta.height]).toEqual([80 * scale, 60 * scale]);
    expect(meta.hasAlpha).toBe(true);
  },
);
it("flattens JPEG on the selected background and supports exact custom dimensions", async () => {
  const { source, request } = await fixture();
  Object.assign(request, {
    format: "jpeg",
    transparent: false,
    background: "#0044cc",
    width: 37,
    height: 29,
  });
  const bytes = await renderExport(source, request),
    meta = await sharp(bytes).metadata();
  expect([meta.width, meta.height, meta.hasAlpha]).toEqual([37, 29, false]);
  const pixel = await sharp(bytes)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  expect(Math.abs(pixel[0]! - 0)).toBeLessThan(4);
  expect(Math.abs(pixel[1]! - 68)).toBeLessThan(4);
  expect(Math.abs(pixel[2]! - 204)).toBeLessThan(4);
});
it("replays identical requests after reopening and rejects key misuse and stale revisions", async () => {
  const { request, doc } = await fixture(),
    first = await createExport(store, request);
  store.db.close();
  store = new Store(root);
  expect((await createExport(store, request)).id).toBe(first.id);
  await expect(createExport(store, { ...request, width: 160 })).rejects.toThrow(
    "retry settings changed",
  );
  store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    width: 81,
  });
  await expect(
    createExport(store, { ...request, idempotencyKey: randomUUID() }),
  ).rejects.toThrow("Master changed");
  expect((await createExport(store, request)).id).toBe(first.id);
});
it("rejects incompatible alpha, oversized images, unsafe colour values and unknown options", async () => {
  const { request } = await fixture();
  for (const extra of [
    { format: "jpeg" },
    { width: 10000, height: 10000 },
    { background: "url(http://host)" },
    { quality: 101 },
    { unknown: true },
  ])
    expect(
      exportRequestSchema.safeParse({ ...request, ...extra }).success,
    ).toBe(false);
});
it("serves a real attachment with stored image bytes and enforces session and origin protections", async () => {
  const { request } = await fixture(),
    app = await createApp({ dataDir: root, worker: false });
  const headers = { host: "127.0.0.1:2027" };
  try {
    expect(
      (
        await app.app.inject({
          method: "POST",
          url: "/api/exports",
          headers,
          payload: request,
        })
      ).statusCode,
    ).toBe(403);
    const token = (
      await app.app.inject({ url: "/api/session", headers })
    ).json().token;
    const response = await app.app.inject({
      method: "POST",
      url: "/api/exports",
      headers: { ...headers, "x-darkroom-token": token },
      payload: request,
    });
    expect(response.statusCode).toBe(201);
    const record = response.json();
    const download = await app.app.inject({
      url: `/api/exports/${record.id}/download`,
      headers,
    });
    expect(download.headers["content-type"]).toContain("image/png");
    expect(download.headers["content-disposition"]).toContain(record.filename);
    expect(download.rawPayload).toEqual(store.assetBytes(record.assetId));
    expect(
      (
        await app.app.inject({
          url: `/api/exports/${record.id}/download`,
          headers: { host: "evil.example" },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.app.close();
  }
});
