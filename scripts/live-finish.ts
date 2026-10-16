// Owned fixture through HTTP, persisted queue and real engine. Does not accept a result.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const origin = process.env.DR_FINISH_LIVE_URL ?? "http://127.0.0.1:2042",
  root = process.env.DR_FINISH_LIVE_EVIDENCE ?? "data/restore-release/evidence",
  task =
    process.env.DR_FINISH_LIVE_TASK === "Restore"
      ? "Restore"
      : "Remove background";
mkdirSync(root, { recursive: true });
async function get(path: string) {
  const r = await fetch(origin + "/api" + path);
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const { token } = await get("/session");
async function post(path: string, payload: unknown, method = "POST") {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-darkroom-token": token },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const project = await post("/projects", { name: `${task} validation · NOIR` }),
  source = await sharp(
    readFileSync(
      task === "Restore"
        ? "data/restore-qa/384-degraded.before.png"
        : "data/create-qa/reference-1.png",
    ),
  )
    .resize(384, 384)
    .png()
    .toBuffer(),
  body = new FormData();
body.append(
  "file",
  new Blob([source], { type: "image/png" }),
  "NOIR · Finish fixture.png",
);
const uploaded = await fetch(origin + "/api/assets?projectId=" + project.id, {
  method: "POST",
  headers: { "x-darkroom-token": token },
  body,
});
if (!uploaded.ok) throw Error(await uploaded.text());
const asset = await uploaded.json();
let doc = await post(`/projects/${project.id}/documents`, {
  assetId: asset.id,
});
if (task === "Restore")
  doc = await post(
    `/documents/${doc.id}`,
    {
      expectedRevision: doc.currentRevisionId,
      snapshot: {
        ...doc.snapshot,
        selection: [
          { x: 146, y: 164 },
          { x: 238, y: 164 },
          { x: 238, y: 267 },
          { x: 146, y: 267 },
        ],
      },
    },
    "PATCH",
  );
const request = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    idempotencyKey: randomUUID(),
    task,
    width: 384,
    height: 384,
  },
  start = Date.now(),
  row = await post("/finish", request);
if ((await post("/finish", request)).jobId !== row.jobId)
  throw Error("Finishing replay duplicated the job");
console.log(
  JSON.stringify({
    projectId: project.id,
    documentId: doc.id,
    jobId: row.jobId,
    state: "submitted",
  }),
);
let complete = false;
while (Date.now() - start < 600000) {
  const job = await get("/jobs/" + row.jobId);
  if (["failed", "interrupted", "uncertain"].includes(job.state))
    throw Error(job.error);
  if (job.state === "succeeded") {
    const bytes = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + job.resultId)
        ).arrayBuffer(),
      ),
      pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
    if (
      (task === "Remove background" && pixels[3] !== 0) ||
      pixels[(192 * 384 + 192) * 4 + 3]! < 250
    )
      throw Error("Live alpha check failed");
    let protectedPixels = 0;
    if (task === "Restore") {
      const before = await sharp(source).ensureAlpha().raw().toBuffer();
      for (let y = 164; y < 267; y++)
        for (let x = 146; x < 238; x++) {
          const i = (y * 384 + x) * 4;
          if (!pixels.subarray(i, i + 4).equals(before.subarray(i, i + 4)))
            throw Error("Live protected label changed");
          protectedPixels++;
        }
    }
    if (
      (await get("/documents/" + doc.id)).currentRevisionId !==
      doc.currentRevisionId
    )
      throw Error("Master changed before review");
    const original = Buffer.from(
      await (await fetch(origin + "/api/assets/" + asset.id)).arrayBuffer(),
    );
    if (!original.equals(source)) throw Error("Original changed");
    writeFileSync(root + "/result.png", bytes);
    writeFileSync(
      root + "/live.json",
      JSON.stringify(
        {
          projectId: project.id,
          task,
          protectedPixels,
          documentId: doc.id,
          jobId: row.jobId,
          resultId: job.resultId,
          baseRevision: doc.currentRevisionId,
          ms: Date.now() - start,
          alpha: "PASS",
          originalHash: createHash("sha256").update(source).digest("hex"),
          masterUnchangedBeforeReview: true,
          acceptance: "pending",
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        state: "succeeded",
        alpha: "PASS",
        ms: Date.now() - start,
      }),
    );
    complete = true;
    break;
  }
  await delay(1000);
}
if (!complete) throw Error("Live Finish deadline exceeded");
