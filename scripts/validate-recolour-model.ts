// Compare the existing Klein two-reference route on bounded recolour fixtures.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflowById } from "../apps/api/src/workflow.js";
import { bind, graphHash, preflight } from "../packages/workflows/src/bind.js";
import { editPrompt } from "../packages/routing/src/edit-template.js";
import { protectRequestedEdit } from "../apps/api/src/edit-render.js";
import type { EditRequest } from "../packages/contracts/src/edit.js";
const origin = process.env.DR_QA_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Set isolated loopback QA origin");
const root = "data/recolour-model-validation";
mkdirSync(root, { recursive: true });
const state = JSON.parse(
  readFileSync("data/windows-image-acceptance/run.json", "utf8"),
);
assert.equal(state.origin, origin);
const rows = await (
  await fetch(origin + "/api/documents/" + state.documentId + "/edits")
).json();
const row = rows.find((r: any) => r.jobId === state.actions.Recolour.jobId);
assert.ok(row);
for (const [name, id] of [
  ["mug.before", row.sourceAssetId],
  ["mug.mask", row.maskAssetId],
]) {
  const r: Response = await fetch(origin + "/api/assets/" + id);
  assert.ok(r.ok);
  writeFileSync(root + "/" + name + ".png", Buffer.from(await r.arrayBuffer()));
}
const sphereInstruction =
  "Change only the selected orange sphere to blue. Preserve the sphere's shape, position, lighting and shadows. Keep the bottle, its NOIR label and background unchanged.";
const cases = [
  {
    name: "mug",
    source: root + "/mug.before.png",
    mask: root + "/mug.mask.png",
    seed: 20271017,
    instruction: state.actions.Recolour.request.instruction,
  },
  {
    name: "garment",
    source: "data/scope-qa/garment-reviewed-boundary.before.png",
    mask: "data/scope-qa/garment-reviewed-boundary.allowed-mask.png",
    seed: 2027,
    instruction:
      "Change only the selected spacesuit fabric to dark navy blue. Retain the fabric folds, stitching and shape. Keep the face, hair, badges including their borders and lettering, collar hardware, zipper fasteners, helmet and background unchanged.",
  },
  {
    name: "sphere",
    source: "data/edit-qa/Recolour.before.png",
    mask: "data/edit-qa/Recolour.mask.png",
    seed: 2027,
    instruction: sphereInstruction,
  },
  {
    name: "translucent",
    source: "data/quality-gaps/translucent-recolour.before.png",
    mask: "data/edit-qa/Recolour.mask.png",
    seed: 2027,
    instruction: sphereInstruction,
  },
];
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
assert.ok(inspection.status.verified);
const { graph, manifest } = workflowById("create.klein.2ref");
for (const model of manifest.models)
  assert.equal(
    inspection.status.modelFiles?.find((f) => f.filename === model.filename)
      ?.sha256,
    model.sha256,
  );
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const reports: any[] = existsSync(root + "/report.json")
  ? JSON.parse(readFileSync(root + "/report.json", "utf8"))
  : [];
for (const c of cases) {
  const source = readFileSync(c.source),
    maskPng = readFileSync(c.mask),
    a = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    mask = await sharp(maskPng).removeAlpha().greyscale().raw().toBuffer();
  const previous = reports.find(
    (r) =>
      r.name === c.name &&
      r.sourceHash === hash(source) &&
      r.maskHash === hash(maskPng) &&
      r.engineFingerprint === inspection.status.fingerprint,
  );
  if (previous) continue;
  const journalPath = root + "/" + c.name + ".submission.json";
  let submission = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : undefined;
  if (submission) {
    assert.equal(submission.sourceHash, hash(source));
    assert.equal(submission.maskHash, hash(maskPng));
    assert.equal(
      submission.manifestHash,
      manifest.graphSha256,
      "Inspect changed workflow before resuming",
    );
    assert.equal(submission.instruction, c.instruction);
    assert.equal(submission.seed, c.seed);
  } else {
    const q = await client.queue();
    assert.equal(q.queue_running.length + q.queue_pending.length, 0);
  }
  const refs: string[] = submission
    ? submission.references
    : [
        await client.uploadReference(source),
        await client.uploadReference(maskPng),
      ];
  const prompt = editPrompt({
    task: "Recolour",
    instruction: c.instruction,
  } as EditRequest);
  const compiled = submission
    ? submission.graph
    : bind(graph, manifest, {
        prompt,
        width: a.info.width,
        height: a.info.height,
        seed: c.seed,
        steps: 4,
        reference1: refs[0]!,
        reference2: refs[1]!,
      });
  preflight(
    compiled,
    { ...manifest, graphSha256: graphHash(compiled) },
    await client.json("/object_info"),
    new Set(refs),
  );
  if (submission) {
    assert.equal(submission.sourceHash, hash(source));
    assert.equal(submission.maskHash, hash(maskPng));
    assert.equal(
      submission.graphHash,
      graphHash(compiled),
      "Inspect changed QA settings before resubmission",
    );
  } else {
    submission = {
      references: refs,
      graph: compiled,
      manifestHash: manifest.graphSha256,
      instruction: c.instruction,
      seed: c.seed,
      promptId: await client.submit(compiled, randomUUID()),
      sourceHash: hash(source),
      maskHash: hash(maskPng),
      graphHash: graphHash(compiled),
    };
    writeFileSync(journalPath, JSON.stringify(submission, null, 2));
  }
  console.log(c.name + " " + submission.promptId);
  const start = Date.now();
  let raw: Buffer | undefined;
  while (Date.now() - start < 300000) {
    const h = await client.history(submission.promptId);
    if (h?.status?.status_str === "error") {
      writeFileSync(
        root + "/" + c.name + ".error.json",
        JSON.stringify(h, null, 2),
      );
      throw Error("Engine failure");
    }
    if (h?.status?.completed) {
      raw = await client.image(h.outputs.output.images[0]);
      break;
    }
    await delay(500);
  }
  assert.ok(raw, "Timed out; observe saved submission before retrying");
  const result = await protectRequestedEdit(source, maskPng, raw, "Recolour"),
    b = await sharp(result).ensureAlpha().raw().toBuffer();
  let protectedPixels = 0;
  for (let i = 0; i < mask.length; i++) {
    assert.equal(a.data[i * 4 + 3], b[i * 4 + 3]);
    if (!mask[i] || !a.data[i * 4 + 3]) {
      assert.deepEqual(
        b.subarray(i * 4, i * 4 + 4),
        a.data.subarray(i * 4, i * 4 + 4),
      );
      protectedPixels++;
    }
  }
  writeFileSync(root + "/" + c.name + ".raw.png", raw);
  writeFileSync(root + "/" + c.name + ".png", result);
  reports.push({
    name: c.name,
    sourceHash: hash(source),
    maskHash: hash(maskPng),
    rawHash: hash(raw),
    resultHash: hash(result),
    promptId: submission.promptId,
    graphHash: graphHash(compiled),
    engineFingerprint: inspection.status.fingerprint,
    modelFiles: manifest.models,
    sourceWidth: a.info.width,
    sourceHeight: a.info.height,
    prompt,
    seed: c.seed,
    steps: 4,
    observedMs: Date.now() - start,
    protectedPixels,
    protectedExact: true,
    alphaExact: true,
    visualReview: "pending",
  });
  writeFileSync(root + "/report.json", JSON.stringify(reports, null, 2));
}

if (process.argv.includes("--live")) {
  const path = root + "/live.json";
  let live: any = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : undefined;
  if (!live) {
    live = {
      request: {
        ...state.actions.Recolour.request,
        idempotencyKey: randomUUID(),
      },
    };
    writeFileSync(path, JSON.stringify(live, null, 2));
  }
  const session = await (await fetch(origin + "/api/session")).json();
  const response = await fetch(origin + "/api/edits", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-darkroom-token": session.token,
    },
    body: JSON.stringify(live.request),
  });
  assert.ok(response.ok, await response.text());
  const rows = await (
    await fetch(origin + "/api/documents/" + state.documentId + "/edits")
  ).json();
  const submitted = rows.find(
    (r: any) => r.request.idempotencyKey === live.request.idempotencyKey,
  );
  assert.ok(submitted);
  live.jobId = submitted.jobId;
  writeFileSync(path, JSON.stringify(live, null, 2));
  console.log("Live recolour " + live.jobId);
  const start = Date.now();
  let done = false;
  while (Date.now() - start < 300000) {
    const job = await (await fetch(origin + "/api/jobs/" + live.jobId)).json();
    if (["failed", "interrupted", "uncertain"].includes(job.state))
      throw Error(job.error);
    if (job.state === "succeeded") {
      assert.equal(job.intent.model, "Klein");
      const p = JSON.parse(job.provenance);
      assert.equal(p.workflowId, "create.klein.2ref");
      assert.equal(p.graph.schedule.inputs.steps, 4);
      const response: Response = await fetch(
        origin + "/api/assets/" + job.resultId,
      );
      assert.ok(response.ok);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(
        hash(bytes),
        reports.find((r) => r.name === "mug").resultHash,
        "Live result differs from controlled case",
      );
      const doc = await (
        await fetch(origin + "/api/documents/" + state.documentId)
      ).json();
      assert.equal(doc.currentRevisionId, state.revision);
      Object.assign(live, {
        resultHash: hash(bytes),
        masterUnchanged: true,
        workflowId: p.workflowId,
        executionHash: p.executionHash,
        implementationSha256: p.edit.implementationSha256,
        steps: 4,
        visualReview: "pending",
      });
      writeFileSync(path, JSON.stringify(live, null, 2));
      writeFileSync(root + "/live.png", bytes);
      done = true;
      break;
    }
    await delay(500);
  }
  assert.ok(done, "Timed out; observe persisted job before retrying");
}
