// Compare Qwen edit geometry without changing enabled workflows or user masters.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflowById } from "../apps/api/src/workflow.js";
import { protectRequestedEdit } from "../apps/api/src/edit-render.js";
import { editPrompt } from "../packages/routing/src/edit-template.js";
import { bind, graphHash, preflight } from "../packages/workflows/src/bind.js";
import type { EditRequest } from "../packages/contracts/src/edit.js";

const root = "data/quality-gaps/edit-geometry";
mkdirSync(root, { recursive: true });
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const client = new ComfyClient(config.comfyUrl, config.instance);
const inspection = await client.inspect();
assert.ok(inspection.status.verified, "Verified Desktop required");
const { graph, manifest } = workflowById("create.qwen.2ref");
for (const m of manifest.models)
  assert.equal(
    inspection.status.modelFiles?.find((f) => f.filename === m.filename)
      ?.sha256,
    m.sha256,
  );
const reports: any[] = existsSync(`${root}/runs.json`)
  ? JSON.parse(readFileSync(`${root}/runs.json`, "utf8"))
  : [];
const cases = [
  {
    name: "garment",
    source: "data/scope-qa/garment-reviewed-boundary.before.png",
    mask: "data/scope-qa/garment-reviewed-boundary.allowed-mask.png",
    instruction:
      "Change only the selected spacesuit fabric to dark navy blue. Retain the fabric folds, stitching and shape. Keep the face, hair, badges including their borders and lettering, collar hardware, zipper fasteners, helmet and background unchanged.",
  },
  {
    name: "sphere",
    source: "data/edit-qa/Recolour.before.png",
    mask: "data/edit-qa/Recolour.mask.png",
    instruction:
      "Change only the selected orange sphere to blue. Preserve the sphere's shape, position, lighting and shadows. Keep the bottle, its NOIR label and background unchanged.",
  },
];
for (const c of cases) {
  const source = readFileSync(c.source),
    maskPng = readFileSync(c.mask);
  const before = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = before.info;
  const mask = await sharp(maskPng)
    .removeAlpha()
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer();
  assert.equal(mask.length, width * height);
  const refs = [
    await client.uploadReference(source),
    await client.uploadReference(maskPng),
  ];
  for (const geometry of [
    "current",
    "native-matched",
    "area-matched",
  ] as const) {
    const key = `${c.name}-${geometry}`;
    if (
      reports.some(
        (r) =>
          r.key === key &&
          r.engineFingerprint === inspection.status.fingerprint &&
          r.sourceHash === hash(source) &&
          r.maskHash === hash(maskPng),
      )
    )
      continue;
    const queue = await client.queue();
    assert.equal(
      queue.queue_running.length + queue.queue_pending.length,
      0,
      "Engine busy; rerun to resume",
    );
    const compiled = bind(graph, manifest, {
      prompt: editPrompt({
        task: "Recolour",
        instruction: c.instruction,
      } as EditRequest),
      width,
      height,
      seed: 2027,
      steps: 40,
      reference1: refs[0]!,
      reference2: refs[1]!,
    });
    if (geometry !== "current") {
      if (geometry === "native-matched") compiled.prompt!.inputs.resolution = 0;
      compiled.sample!.inputs.latent_image = ["prompt", 2];
    }
    preflight(
      compiled,
      { ...manifest, graphSha256: graphHash(compiled) },
      await client.json("/object_info"),
      new Set(refs),
    );
    writeFileSync(
      `${root}/${key}.graph.json`,
      JSON.stringify(compiled, null, 2),
    );
    const journalPath = `${root}/${key}.submission.json`;
    let journal: { promptId: string; graphHash: string; startedAt: number };
    if (existsSync(journalPath)) {
      journal = JSON.parse(readFileSync(journalPath, "utf8"));
      assert.equal(
        journal.graphHash,
        graphHash(compiled),
        "Prior submission differs; inspect rather than silently rerun",
      );
    } else {
      journal = {
        promptId: await client.submit(compiled, randomUUID()),
        graphHash: graphHash(compiled),
        startedAt: Date.now(),
      };
      writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    }
    console.log(`Edit geometry ${key}: ${journal.promptId}`);
    const observedAt = Date.now();
    let raw: Buffer | undefined;
    while (Date.now() - observedAt < 300000) {
      const h = await client.history(journal.promptId);
      if (h?.status?.status_str === "error") {
        writeFileSync(`${root}/${key}.error.json`, JSON.stringify(h, null, 2));
        throw Error(`Engine error for ${key}; inspect before resuming`);
      }
      if (h?.status?.completed) {
        raw = await client.image(h.outputs.output.images[0]);
        break;
      }
      await delay(500);
    }
    assert.ok(
      raw,
      `Observation timed out for ${journal.promptId}; rerun observes the same job`,
    );
    const meta = await sharp(raw).metadata();
    const result = await protectRequestedEdit(source, maskPng, raw, "Recolour");
    const resultPixels = await sharp(result).ensureAlpha().raw().toBuffer();
    const rawPixels = await sharp(raw)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    let protectedPixels = 0,
      rawProtectedError = 0,
      selectedPixels = 0,
      orangeRemaining = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) {
        assert.deepEqual(
          resultPixels.subarray(i * 4, i * 4 + 4),
          before.data.subarray(i * 4, i * 4 + 4),
        );
        for (let ch = 0; ch < 3; ch++)
          rawProtectedError += Math.abs(
            rawPixels[i * 4 + ch]! - before.data[i * 4 + ch]!,
          );
        protectedPixels++;
      } else {
        selectedPixels++;
        const r = resultPixels[i * 4]!,
          g = resultPixels[i * 4 + 1]!,
          b = resultPixels[i * 4 + 2]!;
        if (r > g * 1.2 && g > b * 1.25 && r > 60) orangeRemaining++;
      }
    }
    writeFileSync(`${root}/${key}.raw.png`, raw);
    writeFileSync(`${root}/${key}.result.png`, result);
    reports.push({
      key,
      sourceHash: hash(source),
      maskHash: hash(maskPng),
      resultHash: hash(result),
      rawHash: hash(raw),
      promptId: journal.promptId,
      graphHash: journal.graphHash,
      instruction: c.instruction,
      seed: 2027,
      steps: 40,
      width,
      height,
      nativeWidth: meta.width,
      nativeHeight: meta.height,
      ms: Date.now() - journal.startedAt,
      engineFingerprint: inspection.status.fingerprint,
      models: manifest.models.map((m) => ({
        filename: m.filename,
        sha256: m.sha256,
      })),
      protectedPixels,
      protectedPixelsExact: true,
      rawProtectedRGBMAE: rawProtectedError / (protectedPixels * 3),
      selectedPixels,
      orangeRemaining,
      visualReview: "pending",
      enabled: false,
    });
    writeFileSync(`${root}/runs.json`, JSON.stringify(reports, null, 2) + "\n");
    console.log(JSON.stringify(reports.at(-1)));
  }
}
