// Engine completion is mocked here; real GPU outcomes are recorded separately.
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import { ComfyClient } from "../../apps/api/src/comfy.js";
import { Worker } from "../../apps/api/src/worker.js";
import {
  submitFinish,
  reviewFinish,
  finishRow,
} from "../../apps/api/src/finish-jobs.js";
import {
  finishOutput,
  finishGraph,
  finishInput,
} from "../../apps/api/src/finish-workflows.js";
import { finishSignature } from "../../apps/api/src/finish-readiness.js";
import type { FinishRequest } from "../../packages/contracts/src/finish.js";
vi.mock("../../apps/api/src/finish-readiness.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../apps/api/src/finish-readiness.js")
  >()),
  assertFinishReady: vi.fn(async () => ({
    evidenceId: "explicit-test-mock",
    implementationHash: finishSignature(),
  })),
}));
vi.mock("../../apps/api/src/finish-workflows.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../apps/api/src/finish-workflows.js")
  >()),
  preflightFinish: vi.fn(),
}));
let store: Store, root: string;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "finish-jobs-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
async function fixture() {
  const project = store.createProject("Finish tests"),
    bytes = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 180, g: 30, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer(),
    asset = await store.importAsset(bytes, "owned.png", project.id),
    doc = store.createDocument(project.id, asset.id);
  const client = new ComfyClient("http://127.0.0.1:8188", "test");
  vi.spyOn(client, "inspect").mockResolvedValue({
    status: { connected: true, verified: true, models: {}, url: client.url },
    info: {},
  });
  vi.spyOn(client, "queue").mockResolvedValue({
    queue_running: [],
    queue_pending: [],
  });
  const request: FinishRequest = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    idempotencyKey: randomUUID(),
    task: "Remove background",
    width: 256,
    height: 256,
  };
  return { project, bytes, asset, doc, client, request };
}
async function candidate() {
  const f = await fixture(),
    row = await submitFinish(store, f.client, f.request),
    result = await store.internalAsset(f.bytes, "result.png", f.project.id);
  store.completeJob(row.jobId, result.id);
  return { ...f, row, result };
}
it("preserves every RGB byte during removal and multiplies existing alpha by the mask", async () => {
  const { bytes } = await fixture(),
    raw = await sharp({
      create: { width: 256, height: 256, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();
  const output = await finishOutput(bytes, raw, "Remove background", 256, 256),
    before = await sharp(bytes).raw().toBuffer(),
    after = await sharp(output).raw().toBuffer();
  for (let i = 0; i < 256 * 256; i++) {
    expect(after.subarray(i * 4, i * 4 + 3)).toEqual(
      before.subarray(i * 4, i * 4 + 3),
    );
    expect(after[i * 4 + 3]).toBe(64);
  }
});
it("retains the resized alpha plane for AI upscale and rejects wrong dimensions", async () => {
  const { bytes } = await fixture(),
    raw = await sharp({
      create: { width: 512, height: 512, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
  const output = await finishOutput(bytes, raw, "Upscale", 512, 512),
    after = await sharp(output).raw().toBuffer();
  expect([...after.subarray(0, 4)]).toEqual([0, 0, 255, 128]);
  await expect(finishOutput(bytes, raw, "Upscale", 256, 256)).rejects.toThrow(
    "dimensions",
  );
});
it.each(["Upscale", "Restore"] as const)(
  "%s removes the engine matte while retaining faint coverage and protected details",
  async (task) => {
    const width = 64,
      height = 64;
    const data = Buffer.alloc(width * height * 4);
    const alphas = [0, 1, 16, 31, 128, 192, 254, 255];
    for (let i = 0; i < width * height; i++)
      data.set([240, 60, 20, alphas[Math.floor((i % width) / 8)]!], i * 4);
    const source = await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    const { engine } = await finishInput(source, task, width, height);
    const preserve = [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 16 },
      { x: 0, y: 16 },
    ];
    // Identity engine isolates compositor correctness from a generative model.
    const result = await finishOutput(
      source,
      engine,
      task,
      width,
      height,
      task === "Restore" ? preserve : undefined,
    );
    const after = await sharp(result).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        expect(after[i + 3]).toBe(data[i + 3]);
        for (let c = 0; c < 3; c++) {
          if (data[i + 3]! < 32 || (task === "Restore" && y < 16))
            expect(after[i + c]).toBe(data[i + c]);
          // Avoid resized transitions between adjacent alpha bands.
          else if (x % 8 >= 2 && x % 8 <= 5)
            expect(Math.abs(after[i + c]! - data[i + c]!)).toBeLessThanOrEqual(
              2,
            );
        }
      }
  },
);
it("restores at twice the working size while keeping selected RGBA and the full alpha plane exact", async () => {
  const { bytes } = await fixture(),
    preserve = [
      { x: 64, y: 64 },
      { x: 192, y: 64 },
      { x: 192, y: 192 },
      { x: 64, y: 192 },
    ];
  const input = await finishInput(bytes, "Restore", 256, 256),
    meta = await sharp(input.engine).metadata();
  expect([meta.width, meta.height]).toEqual([512, 512]);
  const raw = await sharp({
    create: { width: 512, height: 512, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const result = await finishOutput(bytes, raw, "Restore", 256, 256, preserve),
    before = await sharp(bytes).ensureAlpha().raw().toBuffer(),
    after = await sharp(result).raw().toBuffer();
  expect((await sharp(result).metadata()).width).toBe(256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      expect(after[i + 3]).toBe(before[i + 3]);
      if (x >= 64 && x < 192 && y >= 64 && y < 192)
        expect(after.subarray(i, i + 4)).toEqual(before.subarray(i, i + 4));
    }
  expect([...after.subarray(0, 3)]).toEqual([0, 0, 255]);
  await expect(finishOutput(bytes, raw, "Restore", 256, 256)).rejects.toThrow(
    "Select",
  );
  await expect(finishInput(bytes, "Restore", 1025, 256)).rejects.toThrow(
    "working resolution",
  );
});
it("does not introduce a visible step where faint-alpha protection ends", async () => {
  const width = 256,
    height = 1,
    rgba = Buffer.alloc(width * 4);
  for (let x = 0; x < width; x++) rgba.set([240, 180, 100, x], x * 4);
  const source = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  const raw = await sharp({
    create: { width, height, channels: 3, background: "black" },
  })
    .png()
    .toBuffer();
  const result = await sharp(
    await finishOutput(source, raw, "Upscale", width, height),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let x = 1; x < width; x++)
    for (let c = 0; c < 3; c++) {
      const previous = (result[(x - 1) * 4 + c]! * (x - 1)) / 255;
      const current = (result[x * 4 + c]! * x) / 255;
      expect(Math.abs(current - previous)).toBeLessThan(3);
    }
});
it.each([64, 128, 192])(
  "real 2x resize keeps translucent colour at alpha %i",
  async (alpha) => {
    const source = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 0, g: 204, b: 136, alpha: alpha / 255 },
      },
    })
      .png()
      .toBuffer();
    const { engine, resized } = await finishInput(source, "Upscale", 32, 32);
    const expected = await sharp(resized).ensureAlpha().raw().toBuffer();
    const after = await sharp(
      await finishOutput(source, engine, "Upscale", 32, 32),
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let i = 0; i < 32 * 32; i++) {
      expect(after[i * 4 + 3]).toBe(expected[i * 4 + 3]);
      for (let c = 0; c < 3; c++)
        expect(
          Math.abs(after[i * 4 + c]! - expected[i * 4 + c]!),
        ).toBeLessThanOrEqual(4);
    }
  },
);
it("requires a saved protected selection and freezes it for Restore", async () => {
  const f = await fixture();
  await expect(
    submitFinish(store, f.client, { ...f.request, task: "Restore" }),
  ).rejects.toThrow("Select");
  const selection = [
    { x: 64, y: 64 },
    { x: 192, y: 64 },
    { x: 192, y: 192 },
    { x: 64, y: 192 },
  ];
  const saved = store.saveDocument(f.doc.id, f.doc.currentRevisionId, {
    ...f.doc.snapshot,
    selection,
  });
  const row = await submitFinish(store, f.client, {
    ...f.request,
    expectedRevision: saved.currentRevisionId,
    task: "Restore",
  });
  expect(JSON.parse(row.snapshotJson).selection).toEqual(selection);
  store.saveDocument(f.doc.id, saved.currentRevisionId, {
    ...saved.snapshot,
    selection: undefined,
  });
  expect(
    JSON.parse(finishRow(store, row.jobId)!.snapshotJson).selection,
  ).toEqual(selection);
});
it("atomically accepts one revision, keeps old layers, saves a version and replays review", async () => {
  const f = await candidate(),
    reviewed = reviewFinish(store, f.row.jobId, "accept"),
    doc = store.document(f.doc.id)!;
  expect(doc.snapshot.layers).toHaveLength(2);
  expect(doc.snapshot.layers[0]!.visible).toBe(false);
  expect(doc.snapshot.layers[1]).toMatchObject({ assetId: f.result.id });
  expect(reviewed.acceptedDocumentId).toBe(f.doc.id);
  expect(reviewFinish(store, f.row.jobId, "accept").versionId).toBe(
    reviewed.versionId,
  );
  expect(store.assetBytes(f.asset.id)).toEqual(f.bytes);
  expect(store.assets(f.project.id).some((a) => a.id === f.result.id)).toBe(
    true,
  );
  expect(() => store.review(store.candidates()[0]!.id, "accept")).toThrow(
    "source master",
  );
});
it("guards stale accepts, offers a separate master and makes rejection final", async () => {
  const f = await candidate();
  store.saveDocument(f.doc.id, f.doc.currentRevisionId, {
    ...f.doc.snapshot,
    width: 257,
  });
  expect(() => reviewFinish(store, f.row.jobId, "accept")).toThrow(
    "Master changed",
  );
  const separate = reviewFinish(store, f.row.jobId, "keep-version");
  expect(separate.acceptedDocumentId).not.toBe(f.doc.id);
  expect(store.document(f.doc.id)!.snapshot.width).toBe(257);
  const second = await candidate();
  reviewFinish(store, second.row.jobId, "reject");
  expect(() => reviewFinish(store, second.row.jobId, "accept")).toThrow(
    "rejected",
  );
});
it("replays a saved request while offline and rejects reused keys or aspect distortion", async () => {
  const f = await fixture(),
    first = await submitFinish(store, f.client, f.request);
  vi.spyOn(f.client, "inspect").mockRejectedValue(Error("offline"));
  expect((await submitFinish(store, f.client, f.request)).jobId).toBe(
    first.jobId,
  );
  await expect(
    submitFinish(store, f.client, { ...f.request, width: 512 }),
  ).rejects.toThrow("settings changed");
  await expect(
    submitFinish(store, f.client, {
      ...f.request,
      idempotencyKey: randomUUID(),
      task: "Upscale",
      width: 512,
      height: 256,
    }),
  ).rejects.toThrow("aspect ratio");
});
it("uses the shared serial worker and recovers an acknowledged completion without re-submission", async () => {
  const f = await fixture(),
    row = await submitFinish(store, f.client, f.request);
  vi.spyOn(f.client, "json").mockResolvedValue({});
  vi.spyOn(f.client, "uploadReference").mockResolvedValue("uploaded.png");
  const submit = vi
    .spyOn(f.client, "submit")
    .mockResolvedValue("prompt-finish");
  vi.spyOn(f.client, "history").mockResolvedValue({
    status: { completed: true },
    outputs: {
      "99": {
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
      },
    },
  });
  vi.spyOn(f.client, "image").mockResolvedValue(
    await sharp({
      create: { width: 256, height: 256, channels: 3, background: "white" },
    })
      .png()
      .toBuffer(),
  );
  const worker = new Worker(store, f.client);
  await worker.tick();
  expect(store.job(row.jobId)!.state).toBe("succeeded");
  expect(submit).toHaveBeenCalledTimes(1);
  const resultId = store.job(row.jobId)!.resultId!;
  store.updateJob(row.jobId, "running");
  await worker.recover();
  expect(store.job(row.jobId)!.state).toBe("succeeded");
  expect(store.job(row.jobId)!.resultId).toBe(resultId);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(finishRow(store, row.jobId)!.disposition).toBe("candidate");
  await worker.stop();
});
