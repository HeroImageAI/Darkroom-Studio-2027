// Opt-in real HTTP → queue → ComfyUI → protected candidate test. Does not accept it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const origin = process.env.DR_EDIT_LIVE_URL ?? "http://127.0.0.1:2037";
async function get(path: string) {
  const r = await fetch(origin + "/api" + path);
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const { token } = await get("/session");
async function post(path: string, body: unknown, method = "POST") {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-darkroom-token": token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const project = await post("/projects", { name: "AI edit validation · NOIR" });
const bytes = readFileSync("data/edit-qa/Recolour.before.png"),
  form = new FormData();
form.append(
  "file",
  new Blob([bytes], { type: "image/png" }),
  "NOIR with orange.png",
);
const upload = await fetch(origin + "/api/assets?projectId=" + project.id, {
  method: "POST",
  headers: { "x-darkroom-token": token },
  body: form,
});
if (!upload.ok) throw Error(await upload.text());
const asset = await upload.json();
const doc = await post("/projects/" + project.id + "/documents", {
  assetId: asset.id,
});
const snapshot = {
  ...doc.snapshot,
  selection: [
    { x: 60, y: 460 },
    { x: 260, y: 460 },
    { x: 260, y: 680 },
    { x: 60, y: 680 },
  ],
};
const saved = await post(
  "/documents/" + doc.id,
  { expectedRevision: doc.currentRevisionId, snapshot },
  "PATCH",
);
const request = {
  documentId: doc.id,
  expectedRevision: saved.currentRevisionId,
  instruction:
    "Change the orange sphere on the left to a deep blue sphere. Preserve its shape, shading and position. Keep the black NOIR bottle unchanged.",
  task: "Recolour",
  area: "selection",
  seed: 2027,
  idempotencyKey: randomUUID(),
};
const started = Date.now(),
  submitted = await post("/edits", request);
console.log("Submitted real edit " + submitted.jobId);
if ((await post("/edits", request)).jobId !== submitted.jobId)
  throw Error("Request replay created another edit");
let complete = false;
for (let i = 0; i < 600; i++) {
  const entry = (await get("/documents/" + doc.id + "/edits")).find(
    (e: any) => e.jobId === submitted.jobId,
  );
  if (["failed", "interrupted", "uncertain"].includes(entry.job.state))
    throw Error(entry.job.error);
  if (entry.job.state === "succeeded") {
    const result = Buffer.from(
      await (
        await fetch(origin + "/api/assets/" + entry.job.resultId)
      ).arrayBuffer(),
    );
    const source = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + entry.sourceAssetId)
        ).arrayBuffer(),
      ),
      mask = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + entry.maskAssetId)
        ).arrayBuffer(),
      );
    const a = await sharp(source).ensureAlpha().raw().toBuffer(),
      b = await sharp(result).ensureAlpha().raw().toBuffer(),
      m = await sharp(mask).greyscale().raw().toBuffer();
    let protectedPixels = 0;
    for (let n = 0; n < m.length; n++)
      if (m[n] === 0) {
        protectedPixels++;
        if (!a.subarray(n * 4, n * 4 + 4).equals(b.subarray(n * 4, n * 4 + 4)))
          throw Error("Protected pixel changed");
      }
    if (
      (await get("/documents/" + doc.id)).currentRevisionId !==
      saved.currentRevisionId
    )
      throw Error("Master changed before review");
    const original = Buffer.from(
      await (await fetch(origin + "/api/assets/" + asset.id)).arrayBuffer(),
    );
    if (!original.equals(bytes)) throw Error("Original bytes changed");
    mkdirSync("data/ai-edit-final/evidence", { recursive: true });
    writeFileSync("data/ai-edit-final/evidence/live-result.png", result);
    const evidence = {
      at: new Date().toISOString(),
      projectId: project.id,
      documentId: doc.id,
      jobId: submitted.jobId,
      baseRevisionId: saved.currentRevisionId,
      elapsedMs: Date.now() - started,
      protectedPixels,
      protectedPixelsExact: true,
      originalUnchanged: true,
      masterUnchangedBeforeReview: true,
      request,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      outputHash: createHash("sha256").update(result).digest("hex"),
      provenance: JSON.parse(entry.job.provenance),
      visualAssessment: "PENDING manual browser review",
    };
    writeFileSync(
      "data/ai-edit-final/evidence/live.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log({
      documentId: doc.id,
      jobId: submitted.jobId,
      elapsedMs: evidence.elapsedMs,
      protectedPixels,
    });
    complete = true;
    break;
  }
  await delay(1000);
}
if (!complete) throw Error("Timed out. Inspect engine before retrying.");
