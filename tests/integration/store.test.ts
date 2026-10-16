import { beforeEach, afterEach, it, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { migrate } from "../../apps/api/src/migrate.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { Store, Conflict } from "../../apps/api/src/store.js";
let root: string;
let store: Store;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "darkroom-store-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});
const image = () =>
  sharp({
    create: {
      width: 64,
      height: 48,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
it("keeps camera-oriented originals intact and uses their displayed dimensions", async () => {
  const p = store.createProject("Camera");
  const bytes = await sharp(await image())
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const asset = await store.importAsset(bytes, "camera.jpg", p.id);
  expect(asset.width).toBe(48);
  expect(asset.height).toBe(64);
  expect(store.assetBytes(asset.id)).toEqual(bytes);
  expect(store.createDocument(p.id, asset.id).snapshot).toMatchObject({
    width: 48,
    height: 64,
  });
});
it("recovers editable masks selection and transforms from immutable revisions after restart", async () => {
  const p = store.createProject("Edit");
  const bytes = await image();
  const a = await store.importAsset(bytes, "original.png", p.id);
  const doc = store.createDocument(p.id, a.id);
  const next = structuredClone(doc.snapshot);
  const layer = next.layers[0]!;
  layer.locked = false;
  layer.transform = { x: -8, y: 12, rotation: 33, scaleX: 0.7, scaleY: 1.4 };
  layer.opacity = 0.8;
  if ("assetId" in layer)
    layer.maskStrokes = [
      {
        size: 12,
        reveal: false,
        points: [
          { x: 10, y: 12 },
          { x: 20, y: 18 },
        ],
      },
    ];
  next.selection = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const saved = store.saveDocument(doc.id, doc.currentRevisionId, next);
  const v = store.version(doc.id, "Masked master");
  expect(() =>
    store.version(doc.id, "Stale version", doc.currentRevisionId),
  ).toThrow(Conflict);
  expect(
    store.version(doc.id, "Current version", saved.currentRevisionId)
      .revisionId,
  ).toBe(saved.currentRevisionId);
  store.close();
  store = new Store(root);
  expect(store.document(doc.id)?.snapshot).toEqual(next);
  expect(store.document(doc.id)?.currentRevisionId).toBe(v.revisionId);
  expect(store.assetBytes(a.id)).toEqual(bytes);
  expect(() =>
    store.saveDocument(doc.id, doc.currentRevisionId, doc.snapshot),
  ).toThrow(Conflict);
  expect(store.document(doc.id)?.currentRevisionId).toBe(
    saved.currentRevisionId,
  );
});
it("preserves exact original bytes and metadata across reopen", async () => {
  const p = store.createProject("Test");
  const bytes = await image();
  const asset = await store.importAsset(bytes, "original.png", p.id);
  expect(store.assetBytes(asset.id)).toEqual(bytes);
  expect(asset.alpha).toBe(true);
  store.close();
  store = new Store(root);
  expect(store.assets(p.id)[0]?.id).toBe(asset.id);
  expect(store.reconcile()).toEqual({ missing: [], orphaned: [] });
});
it("rejects corrupt/non-image uploads without DB assets", async () => {
  const p = store.createProject("Test");
  await expect(
    store.importAsset(Buffer.from("<svg></svg>"), "bad.png", p.id),
  ).rejects.toThrow();
  expect(store.assets(p.id)).toEqual([]);
});
it("keeps immutable revisions, conflict protection and named versions", async () => {
  const p = store.createProject("Test");
  const asset = await store.importAsset(await image(), "x", p.id);
  const d = store.createDocument(p.id, asset.id);
  const snapshot = { ...d.snapshot, width: 128 };
  const saved = store.saveDocument(d.id, d.currentRevisionId, snapshot);
  expect(saved.currentRevisionId).not.toBe(d.currentRevisionId);
  expect(() => store.saveDocument(d.id, d.currentRevisionId, snapshot)).toThrow(
    Conflict,
  );
  expect(store.version(d.id, "Checkpoint").revisionId).toBe(
    saved.currentRevisionId,
  );
  expect(store.assetBytes(asset.id)).toEqual(await image());
  expect(
    store.db.prepare("SELECT COUNT(*) AS count FROM revisions").get()?.count,
  ).toBe(2);
});
it("prevents cross-project asset references", async () => {
  const a = store.createProject("A");
  const b = store.createProject("B");
  const asset = await store.importAsset(await image(), "a", a.id);
  expect(() => store.createDocument(b.id, asset.id)).toThrow(
    "not in this project",
  );
});
it("deduplicates physical content without losing source records", async () => {
  const p = store.createProject("Test");
  const one = await store.importAsset(await image(), "first", p.id);
  const two = await store.importAsset(await image(), "second", p.id);
  expect(one.hash).toBe(two.hash);
  expect(one.id).not.toBe(two.id);
  expect(store.assets(p.id)).toHaveLength(2);
});
it("retains queued jobs and durable SSE events across restart", () => {
  const p = store.createProject("Test");
  const intent = {
    prompt: "one red cube",
    width: 512,
    height: 512,
    seed: 1,
    model: "Auto" as const,
  };
  const key = randomUUID();
  const j = store.enqueue(p.id, intent, key);
  expect(store.enqueue(p.id, intent, key).id).toBe(j.id);
  expect(() =>
    store.enqueue(p.id, { ...intent, prompt: "different" }, key),
  ).toThrow(Conflict);
  store.updateJob(j.id, "running", { promptId: "engine-id" });
  const sequence = Number(store.events(0)[0]!.sequence);
  store.close();
  store = new Store(root);
  expect(store.job(j.id)?.promptId).toBe("engine-id");
  expect(store.events(sequence)).toHaveLength(1);
});
it("reports orphan files without deleting them", () => {
  writeFileSync(join(root, "tmp", "interrupted"), "bytes");
  expect(store.reconcile().orphaned).toContain(join("tmp", "interrupted"));
});
it("backs up before a forward schema migration and rolls back invalid SQL", () => {
  const p = store.createProject("Before migration");
  const migrations = join(root, "future-migrations");
  mkdirSync(migrations);
  writeFileSync(
    join(migrations, "005_description.sql"),
    "ALTER TABLE projects ADD COLUMN description TEXT;",
  );
  migrate(store.db, root, migrations);
  expect(readdirSync(join(root, "backups"))).toHaveLength(1);
  expect(store.project(p.id)?.name).toBe("Before migration");
  writeFileSync(
    join(migrations, "006_broken.sql"),
    "CREATE TABLE tentative(id INTEGER); THIS IS INVALID;",
  );
  expect(() => migrate(store.db, root, migrations)).toThrow();
  expect(
    store.db
      .prepare("SELECT name FROM sqlite_master WHERE name='tentative'")
      .get(),
  ).toBeUndefined();
  expect(
    store.db.prepare("SELECT MAX(version) AS v FROM migrations").get()?.v,
  ).toBe(5);
});
it("leases worker ownership across separate connections and releases safely", () => {
  const second = new Store(root);
  try {
    expect(store.lease("first")).toBe(true);
    expect(second.lease("second")).toBe(false);
    expect(store.lease("first")).toBe(true);
    second.releaseLease("second");
    expect(second.lease("second")).toBe(false);
    store.releaseLease("first");
    expect(second.lease("second")).toBe(true);
  } finally {
    second.close();
  }
});
