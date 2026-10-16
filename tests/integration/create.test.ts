import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store, Conflict } from "../../apps/api/src/store.js";
import { createRequestSchema } from "../../packages/contracts/src/index.js";
let root: string;
let store: Store;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "create-"));
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
      height: 64,
      channels: 4,
      background: { r: 227, g: 24, b: 36, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
function request(projectId: string) {
  return createRequestSchema.parse({
    projectId,
    idempotencyKey: randomUUID(),
    variations: 4,
    intent: {
      prompt: "Exactly two red cubes. Text: NOIR. No plants.",
      width: 768,
      height: 768,
      seed: 2 ** 32 - 2,
      quality: "Draft",
      model: "Auto",
      references: [],
    },
  });
}
it("atomically creates 1–4 serial variation jobs with exact intent and wrapping seeds", () => {
  const p = store.createProject("Create");
  const input = request(p.id);
  const batch = store.createBatch(input);
  expect(batch.jobs).toHaveLength(4);
  expect(batch.jobs.map((j) => j.intent.seed)).toEqual([
    2 ** 32 - 2,
    2 ** 32 - 1,
    0,
    1,
  ]);
  expect(batch.jobs.every((j) => j.intent.prompt === input.intent.prompt)).toBe(
    true,
  );
  expect(batch.jobs.every((j) => j.state === "queued")).toBe(true);
  expect(store.createBatch(input).id).toBe(batch.id);
  expect(store.jobs()).toHaveLength(4);
  expect(() => store.createBatch({ ...input, variations: 2 })).toThrow(
    Conflict,
  );
});
it("rejects foreign references without creating a batch or jobs", async () => {
  const p = store.createProject("A");
  const other = store.createProject("B");
  const asset = await store.importAsset(await image(), "ref.png", other.id);
  const r = request(p.id);
  r.intent.references = [asset.id];
  expect(() => store.createBatch(r)).toThrow("does not belong");
  expect(store.jobs()).toHaveLength(0);
  expect(store.batches(p.id)).toHaveLength(0);
});
it("preserves reference order and does not mutate original assets", async () => {
  const p = store.createProject("References");
  const a = await store.importAsset(await image(), "A.png", p.id);
  const b = await store.importAsset(await image(), "B.png", p.id);
  const r = request(p.id);
  r.intent.references = [b.id, a.id];
  store.createBatch(r);
  expect(store.jobs()[0]?.intent.references).toEqual([b.id, a.id]);
  expect(store.assetBytes(a.id)).toEqual(await image());
});
it("idempotently reviews candidates into independent versioned masters", async () => {
  const p = store.createProject("Review");
  const batch = store.createBatch(request(p.id));
  const asset = await store.importAsset(
    await image(),
    "Result.png",
    p.id,
    "generated",
  );
  const job = batch.jobs[0]!;
  store.completeJob(job.id, asset.id);
  store.completeJob(job.id, asset.id);
  expect(store.candidates()).toHaveLength(1);
  const c = store.candidates()[0]!;
  const kept = store.review(c.id, "keep-version");
  const accepted = store.review(c.id, "accept");
  expect(accepted.documentId).toBe(kept.documentId);
  expect(store.documents(p.id)).toHaveLength(1);
  expect(store.db.prepare("SELECT COUNT(*) AS n FROM versions").get()?.n).toBe(
    1,
  );
  expect(store.review(c.id, "reject").disposition).toBe("rejected");
  expect(store.assetBytes(asset.id)).toEqual(await image());
  expect(store.review(c.id, "send-to-edit").documentId).toBe(kept.documentId);
});
it("restores batch and candidate history after service reopen", async () => {
  const p = store.createProject("Durable");
  const b = store.createBatch(request(p.id));
  const asset = await store.importAsset(
    await image(),
    "Result.png",
    p.id,
    "generated",
  );
  store.completeJob(b.jobs[0]!.id, asset.id);
  store.close();
  store = new Store(root);
  expect(store.batches(p.id)[0]?.candidates[0]?.assetId).toBe(asset.id);
  expect(store.batches(p.id)[0]?.jobs).toHaveLength(4);
});
it("rejects invalid counts, duplicate references and unsafe custom dimensions", () => {
  const r = request(store.createProject("Limits").id);
  expect(() => createRequestSchema.parse({ ...r, variations: 5 })).toThrow();
  expect(() =>
    createRequestSchema.parse({
      ...r,
      intent: { ...r.intent, width: 1536, height: 1536 },
    }),
  ).toThrow();
  const id = randomUUID();
  expect(() =>
    createRequestSchema.parse({
      ...r,
      intent: { ...r.intent, references: [id, id] },
    }),
  ).toThrow();
});
