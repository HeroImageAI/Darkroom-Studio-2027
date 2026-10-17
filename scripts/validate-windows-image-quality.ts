// Real app/API acceptance on a dedicated QA project. Does not accept model results.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const origin = process.env.DR_QA_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Set DR_QA_ORIGIN to the isolated local preview");
const root = "data/windows-image-acceptance";
mkdirSync(root, { recursive: true });
async function get(path: string) {
  const r = await fetch(origin + "/api" + path);
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const { token } = await get("/session");
async function post(path: string, body: unknown) {
  const r = await fetch(origin + "/api" + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-darkroom-token": token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const path = root + "/run.json";
const state: any = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      origin,
      projectId: (await post("/projects", { name: "Windows image acceptance" }))
        .id,
      cases: [],
    };
assert.equal(state.origin, origin, "QA workspace changed");
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
save();
const prompt =
  'A realistic studio product photograph of exactly two ceramic mugs on a light grey tabletop. On the left is one glossy red mug with the word "NOIR" printed clearly in black uppercase letters. On the right is one matte cobalt-blue mug with no lettering. Both mugs are upright and fully visible with separate handles and soft contact shadows. Plain light grey seamless background, soft window light from the left, natural ceramic texture, eye-level camera. No other objects, no extra mugs, no floating text, no border.';
for (const model of ["Klein", "Qwen"]) {
  let c = state.cases.find((v: any) => v.model === model);
  if (!c) {
    c = {
      model,
      request: {
        projectId: state.projectId,
        idempotencyKey: randomUUID(),
        variations: 1,
        intent: {
          prompt,
          width: 1024,
          height: 1024,
          seed: 20271017,
          quality: "Final",
          model,
          references: [],
        },
      },
      startedAt: new Date().toISOString(),
    };
    state.cases.push(c);
    save();
  }
  assert.equal(
    c.request.intent.prompt,
    prompt,
    "Saved QA brief changed; use a new ledger",
  );
  assert.equal(c.request.intent.model, model);
  assert.equal(c.request.intent.quality, "Final");
  if (c.status === "succeeded") continue;
  const batch = await post("/create", c.request);
  assert.equal(batch.jobs.length, 1);
  c.jobId = batch.jobs[0].id;
  save();
  console.log(model + " " + c.jobId);
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const job = await get("/jobs/" + c.jobId);
    if (["failed", "interrupted", "uncertain", "cancelled"].includes(job.state))
      throw Error(model + ": " + job.state + " " + job.error);
    if (job.state === "succeeded") {
      const r: Response = await fetch(origin + "/api/assets/" + job.resultId);
      assert.ok(r.ok);
      const output = Buffer.from(await r.arrayBuffer()),
        meta = await sharp(output).metadata();
      assert.equal(meta.width, 1024);
      assert.equal(meta.height, 1024);
      const provenance =
        typeof job.provenance === "string"
          ? JSON.parse(job.provenance)
          : job.provenance;
      assert.equal(job.intent.model, model);
      assert.equal(job.intent.prompt, prompt);
      assert.ok(
        JSON.stringify(provenance).includes(
          "create." + model.toLowerCase() + ".0ref",
        ),
        "Explicit model route not honoured",
      );
      Object.assign(c, {
        status: "succeeded",
        assetId: job.resultId,
        completedAt: new Date().toISOString(),
        sha256: createHash("sha256").update(output).digest("hex"),
        width: meta.width,
        height: meta.height,
        provenance,
        visualReview: "pending",
      });
      writeFileSync(root + "/" + model + ".png", output);
      save();
      console.log(JSON.stringify({ model, jobId: c.jobId, sha256: c.sha256 }));
      break;
    }
    await delay(1000);
  }
  assert.equal(
    c.status,
    "succeeded",
    "Timed out; inspect saved job before retrying",
  );
}

// Work only with the QA-generated Qwen image; all model outputs remain candidates.
if (!state.documentId) {
  const source = state.cases.find((c: any) => c.model === "Qwen");
  const doc = await post("/projects/" + state.projectId + "/documents", {
    assetId: source.assetId,
  });
  const response = await fetch(origin + "/api/documents/" + doc.id, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-darkroom-token": token },
    body: JSON.stringify({
      expectedRevision: doc.currentRevisionId,
      snapshot: {
        ...doc.snapshot,
        selection: [
          { x: 32, y: 340 },
          { x: 480, y: 340 },
          { x: 480, y: 744 },
          { x: 32, y: 744 },
        ],
      },
    }),
  });
  assert.ok(response.ok, await response.text());
  const saved = await get("/documents/" + doc.id);
  state.documentId = saved.id;
  state.revision = saved.currentRevisionId;
  save();
}
async function jobOutput(
  name: string,
  endpoint: string,
  request: unknown,
  width: number,
  height: number,
) {
  state.actions ??= {};
  let c = state.actions[name];
  if (!c) {
    c = { request, idempotencyKey: randomUUID() };
    state.actions[name] = c;
    save();
  }
  if (c.status === "succeeded") return;
  const submitted = await post(endpoint, {
    ...c.request,
    idempotencyKey: c.idempotencyKey,
  });
  c.jobId = submitted.jobId;
  save();
  console.log(name + " " + c.jobId);
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const job = await get("/jobs/" + c.jobId);
    if (["failed", "interrupted", "uncertain", "cancelled"].includes(job.state))
      throw Error(name + ": " + job.state + " " + job.error);
    if (job.state === "succeeded") {
      const r = await fetch(origin + "/api/assets/" + job.resultId);
      assert.ok(r.ok);
      const bytes = Buffer.from(await r.arrayBuffer()),
        meta = await sharp(bytes).metadata();
      assert.equal(meta.width, width);
      assert.equal(meta.height, height);
      const doc = await get("/documents/" + state.documentId);
      assert.equal(
        doc.currentRevisionId,
        state.revision,
        "Unreviewed action changed the master",
      );
      Object.assign(c, {
        status: "succeeded",
        assetId: job.resultId,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: meta.width,
        height: meta.height,
        masterUnchanged: true,
        provenance:
          typeof job.provenance === "string"
            ? JSON.parse(job.provenance)
            : job.provenance,
        visualReview: "pending",
      });
      writeFileSync(root + "/" + name + ".png", bytes);
      save();
      console.log(JSON.stringify({ name, sha256: c.sha256 }));
      break;
    }
    await delay(1000);
  }
  assert.equal(
    c.status,
    "succeeded",
    "Timed out; inspect saved job before retrying",
  );
}
await jobOutput(
  "Recolour",
  "/edits",
  {
    documentId: state.documentId,
    expectedRevision: state.revision,
    task: "Recolour",
    area: "selection",
    seed: 20271017,
    instruction:
      "Change only the red mug on the left to forest green. Preserve its shape, handle, glossy ceramic finish, lighting, shadow and the exact black word NOIR. Keep the blue mug, tabletop, background, camera framing and all other details unchanged.",
  },
  1024,
  1024,
);
const editPixels = await sharp(readFileSync(root + "/Recolour.png"))
  .ensureAlpha()
  .raw()
  .toBuffer();
let protectedPixels = 0;
const editRow = (await get("/documents/" + state.documentId + "/edits")).find(
  (v: any) => v.jobId === state.actions.Recolour.jobId,
);
assert.ok(editRow);
const frozenResponse = await fetch(
  origin + "/api/assets/" + editRow.sourceAssetId,
);
assert.ok(frozenResponse.ok);
const sourcePixels = await sharp(
  Buffer.from(await frozenResponse.arrayBuffer()),
)
  .ensureAlpha()
  .raw()
  .toBuffer();
const originalCase = state.cases.find((c: any) => c.model === "Qwen");
const originalResponse = await fetch(
  origin + "/api/assets/" + originalCase.assetId,
);
assert.ok(originalResponse.ok);
assert.equal(
  createHash("sha256")
    .update(Buffer.from(await originalResponse.arrayBuffer()))
    .digest("hex"),
  originalCase.sha256,
  "Original generated asset changed",
);
const maskResponse = await fetch(origin + "/api/assets/" + editRow.maskAssetId);
assert.ok(maskResponse.ok);
const mask = await sharp(Buffer.from(await maskResponse.arrayBuffer()))
  .removeAlpha()
  .greyscale()
  .raw()
  .toBuffer();
assert.equal(mask.length, 1024 * 1024);
for (let n = 0; n < mask.length; n++) {
  const i = n * 4;
  assert.equal(editPixels[i + 3], sourcePixels[i + 3]);
  if (mask[n] === 0) {
    assert.deepEqual(
      editPixels.subarray(i, i + 4),
      sourcePixels.subarray(i, i + 4),
    );
    protectedPixels++;
  }
}
state.actions.Recolour.protectedPixels = protectedPixels;
state.actions.Recolour.protectedExact = true;
save();
for (const [task, width] of [
  ["Upscale", 2048],
  ["Remove background", 1024],
] as const)
  await jobOutput(
    task.replaceAll(" ", "-"),
    "/finish",
    {
      documentId: state.documentId,
      expectedRevision: state.revision,
      task,
      width,
      height: width,
    },
    width,
    width,
  );
state.exports ??= {};
for (const format of ["png", "jpeg"]) {
  const record =
    state.exports[format] ??
    (await post("/exports", {
      documentId: state.documentId,
      expectedRevision: state.revision,
      idempotencyKey: randomUUID(),
      format,
      width: 1024,
      height: 1024,
      transparent: false,
      background: "#ffffff",
      quality: 95,
      density: 300,
    }));
  const r: Response = await fetch(
    origin + "/api/exports/" + record.id + "/download",
  );
  assert.ok(r.ok);
  assert.ok(r.headers.get("content-disposition")?.includes("attachment"));
  const bytes = Buffer.from(await r.arrayBuffer()),
    meta = await sharp(bytes).metadata();
  assert.equal(meta.format, format);
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1024);
  assert.equal(meta.density, 300);
  assert.equal(meta.space, "srgb");
  assert.ok(meta.icc?.length, "Export colour profile missing");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256);
  state.exports[format] = { ...record, downloadVerified: true };
  save();
}
assert.equal(
  (await get("/documents/" + state.documentId)).currentRevisionId,
  state.revision,
);
state.masterUnchanged = true;
save();
