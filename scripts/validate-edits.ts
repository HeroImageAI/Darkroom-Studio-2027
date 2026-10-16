// Opt-in model QA. Generates candidates only; never enables edit actions automatically.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflowById } from "../apps/api/src/workflow.js";
import { prepareEdit, protectEdit } from "../apps/api/src/edit-render.js";
import { editPrompt } from "../apps/api/src/edits.js";
import {
  bind,
  preflight,
  graphHash,
  byTitle,
} from "../packages/workflows/src/bind.js";
import { editTasks, type EditRequest } from "../packages/contracts/src/edit.js";
const root = "data/edit-qa";
mkdirSync(root, { recursive: true });
const store = new Store(root + "/store");
const project = store.createProject("Owned edit validation");
const client = new ComfyClient(config.comfyUrl, config.instance);
const inspection = await client.inspect();
if (!inspection.status.verified)
  throw Error(inspection.status.reason ?? "Verified Desktop required");
const { graph, manifest } = workflowById("create.qwen.2ref");
const reports: any[] = existsSync(root + "/runs.json")
  ? JSON.parse(readFileSync(root + "/runs.json", "utf8"))
  : [];
const source = readFileSync("data/create-qa/reference-1.png");
const orange = await sharp(source)
  .composite([
    {
      input: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><radialGradient id="g" cx=".3" cy=".3"><stop stop-color="#ffb43c"/><stop offset="1" stop-color="#df6409"/></radialGradient></defs><ellipse cx="160" cy="650" rx="85" ry="16" fill="#aaa69e"/><circle cx="160" cy="560" r="78" fill="url(#g)"/></svg>',
      ),
    },
  ])
  .png()
  .toBuffer();
const instructions: Record<string, string> = {
  Remove:
    "Remove the orange sphere on the left completely. Fill its place with the same plain beige background. Keep the black NOIR bottle unchanged.",
  Replace:
    "Replace the orange sphere on the left with one blue cube, resting on the same surface. Keep the black NOIR bottle unchanged.",
  Recolour:
    "Change the orange sphere on the left to a deep blue sphere. Preserve its shape, shading and position. Keep the black NOIR bottle unchanged.",
  Background:
    "Change the background outside the protected bottle rectangle to dark navy blue. Keep the bottle, label and the exact NOIR text unchanged.",
  Expand:
    "Continue the plain beige studio background upward into the new top margin. Do not add any new objects.",
  Instruct:
    "Make the orange sphere on the left green. Keep the black NOIR bottle unchanged.",
};
for (const task of editTasks) {
  if (process.env.DR_EDIT_QA_TASK && task !== process.env.DR_EDIT_QA_TASK)
    continue;
  if (
    reports.some(
      (r) =>
        r.task === task &&
        r.engineFingerprint === inspection.status.fingerprint &&
        r.templateVersion === 1,
    )
  )
    continue;
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy. Resume when idle.");
  const asset = await store.importAsset(
    ["Background", "Expand"].includes(task) ? source : orange,
    "Owned NOIR fixture.png",
    project.id,
  );
  const doc = store.createDocument(project.id, asset.id);
  const selected =
    task === "Background"
      ? [
          { x: 270, y: 85 },
          { x: 500, y: 85 },
          { x: 500, y: 710 },
          { x: 270, y: 710 },
        ]
      : [
          { x: 60, y: 460 },
          { x: 260, y: 460 },
          { x: 260, y: 680 },
          { x: 60, y: 680 },
        ];
  const snapshot = {
    ...doc.snapshot,
    ...(task === "Expand" ? {} : { selection: selected }),
  };
  const request: EditRequest = {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    instruction: instructions[task]!,
    task,
    area: task === "Background" ? "outside" : "selection",
    seed: 2027,
    idempotencyKey: randomUUID(),
    ...(task === "Expand"
      ? { expand: { left: 0, right: 0, top: 128, bottom: 0 } }
      : {}),
  };
  const prepared = await prepareEdit(store, snapshot, request);
  writeFileSync(root + "/" + task + ".before.png", prepared.source);
  writeFileSync(root + "/" + task + ".mask.png", prepared.maskPng);
  const refs = [
    await client.uploadReference(prepared.source),
    await client.uploadReference(prepared.maskPng),
  ];
  const values = {
    prompt: editPrompt(request),
    width: prepared.engineWidth,
    height: prepared.engineHeight,
    seed: request.seed,
    steps: 40,
    reference1: refs[0]!,
    reference2: refs[1]!,
  };
  const compiled = bind(graph, manifest, values);
  preflight(
    compiled,
    { ...manifest, graphSha256: graphHash(compiled) },
    await client.json("/object_info"),
    new Set(refs),
  );
  const started = Date.now(),
    promptId = await client.submit(compiled, randomUUID());
  console.log("Rendering " + task + " " + promptId);
  let complete = false,
    peak = 0;
  while (Date.now() - started < 600000) {
    const h = await client.history(promptId);
    const stats = await client.json("/system_stats");
    const d = stats.devices?.[0];
    if (d) peak = Math.max(peak, d.vram_total - d.vram_free);
    if (h?.status?.status_str === "error")
      throw Error(JSON.stringify(h.status));
    if (h?.status?.completed) {
      const [out] = byTitle(compiled, "DR_OUTPUT");
      const raw = await client.image(h.outputs[out].images[0]);
      const result = await protectEdit(prepared.source, prepared.maskPng, raw);
      writeFileSync(root + "/" + task + ".raw.png", raw);
      writeFileSync(root + "/" + task + ".result.png", result);
      const a = await sharp(prepared.source).ensureAlpha().raw().toBuffer(),
        b = await sharp(result).ensureAlpha().raw().toBuffer(),
        m = await sharp(prepared.maskPng)
          .removeAlpha()
          .greyscale()
          .raw()
          .toBuffer();
      let protectedPixels = 0;
      for (let i = 0; i < m.length; i++)
        if (m[i] === 0) {
          protectedPixels++;
          if (
            !a.subarray(i * 4, i * 4 + 4).equals(b.subarray(i * 4, i * 4 + 4))
          )
            throw Error("Protected pixel changed");
        }
      reports.push({
        task,
        request,
        templateVersion: 1,
        workflow: manifest.id,
        workflowHash: manifest.graphSha256,
        executionHash: graphHash(compiled),
        engineFingerprint: inspection.status.fingerprint,
        modelFiles: inspection.status.modelFiles,
        promptId,
        elapsedMs: Date.now() - started,
        peakWholeGpuUsedBytes: peak,
        width: prepared.width,
        height: prepared.height,
        protectedPixels,
        protectedPixelsExact: true,
        sourceHash: createHash("sha256").update(prepared.source).digest("hex"),
        outputHash: createHash("sha256").update(result).digest("hex"),
        visualAssessment: "PENDING",
      });
      writeFileSync(root + "/runs.json", JSON.stringify(reports, null, 2));
      console.log("Completed " + task + " " + (Date.now() - started) + " ms");
      complete = true;
      break;
    }
    await delay(1000);
  }
  if (!complete) throw Error("Timeout: inspect engine before retrying.");
}
store.close();
console.log(
  "Saved " +
    reports.length +
    " scoped model cases. Visual review still required.",
);
