import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  prepareEdit,
  protectRequestedEdit,
} from "../apps/api/src/edit-render.js";
import { editPrompt, editWorkflowId } from "../apps/api/src/edits.js";
import { workflowById } from "../apps/api/src/workflow.js";
import {
  bind,
  preflight,
  graphHash,
  byTitle,
} from "../packages/workflows/src/bind.js";
import {
  finishGraph,
  finishInput,
  finishOutput,
  preflightFinish,
} from "../apps/api/src/finish-workflows.js";
const root = "data/scope-qa";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
if (!inspection.status.verified) throw Error("Verified engine required");
const store = new Store(root + "/photo-store"),
  project = store.createProject("Broader scope correction QA");
const reports: any[] = existsSync(root + "/photo-runs.json")
  ? JSON.parse(readFileSync(root + "/photo-runs.json", "utf8"))
  : [];
async function run(graph: any) {
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy; resume after the current job");
  const start = Date.now(),
    id = await client.submit(graph, randomUUID());
  console.log("GPU case " + id);
  while (Date.now() - start < 600000) {
    const h = await client.history(id);
    if (h?.status?.status_str === "error") throw Error("Engine failed");
    if (h?.status?.completed) {
      const output =
        Object.entries(graph).find(
          ([, n]: any) => n._meta?.title === "DR_OUTPUT",
        )?.[0] ?? "99";
      return {
        raw: await client.image(h.outputs[output].images[0]),
        ms: Date.now() - start,
        promptId: id,
      };
    }
    await delay(1000);
  }
  throw Error("GPU timeout");
}
const photo = readFileSync(root + "/astronaut.png"),
  rocket = await sharp(readFileSync(root + "/rocket.jpg"))
    .resize(512)
    .png()
    .toBuffer();
const sketch = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><path d="M150 260L330 260L380 310L200 310ZM150 260L150 100L330 100L330 260M200 310L190 440M380 310L370 440M150 260L140 390M330 260L320 390" fill="none" stroke="#242424" stroke-width="5" stroke-linejoin="round"/></svg>',
  ),
)
  .png()
  .toBuffer();
writeFileSync(root + "/chair-sketch.png", sketch);
const cases: any[] = [
  {
    name: "person",
    source: photo,
    task: "Background",
    area: "outside",
    mask: root + "/portrait.mask.png",
    instruction:
      "Replace only the background with a plain neutral grey studio backdrop. Keep the person, face, hair, orange suit, patches and helmet exactly unchanged. No extra people or objects.",
  },
  {
    name: "garment",
    source: photo,
    task: "Recolour",
    area: "selection",
    selection: [
      { x: 30, y: 300 },
      { x: 65, y: 285 },
      { x: 98, y: 345 },
      { x: 96, y: 465 },
      { x: 30, y: 470 },
    ],
    instruction:
      "Change only the selected orange sleeve fabric to dark navy blue. Preserve the existing folds, stitching, shading and sleeve shape. Keep all unselected parts, face and patches unchanged.",
  },
  {
    name: "environment",
    source: rocket,
    task: "Expand",
    area: "selection",
    expand: { left: 0, right: 0, top: 128, bottom: 0 },
    instruction:
      "Extend only the sky upward, continuing its existing dark blue colour and atmosphere. Add no objects, stars, text or rockets. Preserve all original launch imagery exactly.",
  },
  {
    name: "sketch",
    source: sketch,
    task: "Instruct",
    area: "whole",
    instruction:
      "Turn this simple chair sketch into a clean studio photograph of one blue wooden chair. Keep the chair's rectangular back, flat seat and four legs in the same three-quarter view and position. Plain white background. No text or extra objects.",
  },
  {
    name: "low-quality-image",
    source: await sharp(
      await sharp(photo).blur(0.6).jpeg({ quality: 35 }).toBuffer(),
    )
      .png()
      .toBuffer(),
    finish: "Restore",
    selection: [
      { x: 145, y: 15 },
      { x: 310, y: 15 },
      { x: 315, y: 195 },
      { x: 145, y: 195 },
    ],
  },
  {
    name: "transparent-object",
    source: await sharp(readFileSync(root + "/glass-full.jpg"))
      .resize({ height: 512 })
      .png()
      .toBuffer(),
    finish: "Remove background",
  },
];
cases.push({
  name: "garment-right-sleeve",
  source: photo,
  task: "Recolour",
  area: "selection",
  mask: "data/quality-gaps/right-sleeve-0.mask.png",
  instruction:
    "Change only the selected orange fabric on the person's right arm sleeve to dark navy blue. Preserve the original sleeve shape, fabric texture, folds and stitching. Keep the badges, lettering, face, hair, helmet, rest of the orange spacesuit and background unchanged.",
});
cases.push({
  name: "garment-sam-refined",
  source: photo,
  task: "Recolour",
  area: "selection",
  mask: root + "/sam-garment.mask.png",
  instruction:
    "Change only the selected orange spacesuit fabric to dark navy blue. Preserve its existing folds, stitching, fabric texture and shape. Keep the face, hair, patches, printed lettering, helmet and all unselected parts unchanged.",
});
try {
  for (const c of cases) {
    if (reports.some((r) => r.name === c.name)) continue;
    const asset = await store.importAsset(
        c.source,
        c.name + ".png",
        project.id,
      ),
      doc = store.createDocument(project.id, asset.id);
    let snapshot = {
      ...doc.snapshot,
      ...(c.selection ? { selection: c.selection } : {}),
    };
    if (c.mask) {
      const a = await store.internalAsset(
        readFileSync(c.mask),
        "Subject mask.png",
        project.id,
      );
      snapshot = { ...snapshot, selectionMaskAssetId: a.id };
    }
    let result: Buffer,
      execution: any,
      protectedPixels = 0;
    if (c.finish) {
      const { engine } = await finishInput(
          c.source,
          c.finish,
          snapshot.width,
          snapshot.height,
        ),
        image = await client.uploadReference(engine),
        graph = finishGraph(c.finish, image);
      preflightFinish(graph, inspection.info, image);
      execution = await run(graph);
      result = await finishOutput(
        c.source,
        execution.raw,
        c.finish,
        snapshot.width,
        snapshot.height,
        c.selection,
      );
    } else {
      const request = {
        documentId: doc.id,
        expectedRevision: doc.currentRevisionId,
        task: c.task,
        area: c.area,
        instruction: c.instruction,
        seed: 2027,
        idempotencyKey: randomUUID(),
        ...(c.expand ? { expand: c.expand } : {}),
      };
      const prepared = await prepareEdit(store, snapshot, request as any);
      const refs = [
        await client.uploadReference(prepared.source),
        await client.uploadReference(prepared.maskPng),
      ];
      const { graph, manifest } = workflowById(editWorkflowId(c.task));
      const compiled = bind(graph, manifest, {
        prompt: editPrompt(request as any),
        width: prepared.engineWidth,
        height: prepared.engineHeight,
        seed: 2027,
        steps: 40,
        reference1: refs[0]!,
        ...(manifest.id.endsWith("2ref") ? { reference2: refs[1]! } : {}),
      });
      preflight(
        compiled,
        { ...manifest, graphSha256: graphHash(compiled) },
        inspection.info,
        new Set(refs),
      );
      execution = await run(compiled);
      result = await protectRequestedEdit(
        prepared.source,
        prepared.maskPng,
        execution.raw,
        c.task,
      );
      const source = await sharp(prepared.source)
          .ensureAlpha()
          .raw()
          .toBuffer(),
        out = await sharp(result).ensureAlpha().raw().toBuffer(),
        mask = await sharp(prepared.maskPng)
          .removeAlpha()
          .greyscale()
          .raw()
          .toBuffer();
      for (let i = 0; i < mask.length; i++)
        if (!mask[i]) {
          assert.deepEqual(
            out.subarray(i * 4, i * 4 + 4),
            source.subarray(i * 4, i * 4 + 4),
          );
          protectedPixels++;
        }
      writeFileSync(
        root + "/" + c.name + ".allowed-mask.png",
        prepared.maskPng,
      );
    }
    writeFileSync(root + "/" + c.name + ".before.png", c.source);
    writeFileSync(root + "/" + c.name + ".raw.png", execution.raw);
    writeFileSync(root + "/" + c.name + ".result.png", result);
    const report = {
      name: c.name,
      task: c.task ?? c.finish,
      instruction: c.instruction ?? null,
      seed: c.finish ? null : 2027,
      sourceHash: createHash("sha256").update(c.source).digest("hex"),
      outputHash: createHash("sha256").update(result).digest("hex"),
      promptId: execution.promptId,
      ms: execution.ms,
      engineFingerprint: inspection.status.fingerprint,
      protectedPixels,
      protectedPixelsExact: protectedPixels > 0,
      visualReview: "pending",
      scope: "One fixture only; general photographic fidelity is not certified",
    };
    reports.push(report);
    writeFileSync(root + "/photo-runs.json", JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(report));
  }
} finally {
  store.close();
}
