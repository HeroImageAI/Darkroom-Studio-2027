// Isolated native-RGBA and reference-geometry diagnostic; never enables a route.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflowById } from "../apps/api/src/workflow.js";
import { bind, graphHash, preflight } from "../packages/workflows/src/bind.js";

const root = "data/quality-gaps/qwen-alpha";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance);
const inspection = await client.inspect();
assert.ok(inspection.status.verified, "Verified Desktop required");
const { graph, manifest } = workflowById("create.qwen.1ref");
for (const model of manifest.models)
  assert.equal(
    inspection.status.modelFiles?.find((f) => f.filename === model.filename)
      ?.sha256,
    model.sha256,
  );
const truth = await sharp("data/quality-gaps/glass-matting/truth.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = truth.info;
const reportPath = `${root}/runs.json`;
const reports: any[] = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : [];
for (const background of ["white", "blue"])
  for (const geometry of ["current", "matched", "matched-area"] as const) {
    const key = `${background}-${geometry}`;
    if (
      reports.some(
        (r) =>
          r.key === key &&
          r.engineFingerprint === inspection.status.fingerprint,
      )
    )
      continue;
    const queue = await client.queue();
    assert.equal(
      queue.queue_running.length + queue.queue_pending.length,
      0,
      "Engine busy; rerun to resume",
    );
    const source = readFileSync(
      `data/quality-gaps/glass-matting/${background}.source.png`,
    );
    const image = await client.uploadReference(source);
    const prompt =
      "Extract the exact bottle from image 1. This is an RGBA image with transparency. Preserve the glass bottle silhouette, translucent glass, dark cap, opaque cream label and its three dark horizontal lines. The image has alpha channel and the background is transparent. Preserve the original framing and position. Remove the background without adding objects, lettering, shadows or a checkerboard pattern.";
    const compiled = bind(graph, manifest, {
      prompt,
      width,
      height,
      seed: 42,
      steps: 40,
      reference1: image,
    });
    if (geometry !== "current") {
      if (geometry === "matched") compiled.prompt!.inputs.resolution = 0;
      compiled.sample!.inputs.latent_image = ["prompt", 2];
    }
    preflight(
      compiled,
      { ...manifest, graphSha256: graphHash(compiled) },
      await client.json("/object_info"),
      new Set([image]),
    );
    writeFileSync(
      `${root}/${key}.graph.json`,
      JSON.stringify(compiled, null, 2),
    );
    const started = Date.now(),
      promptId = await client.submit(compiled, randomUUID());
    console.log(`Qwen alpha ${key}: ${promptId}`);
    let output: Buffer | undefined;
    while (Date.now() - started < 300000) {
      const h = await client.history(promptId);
      if (h?.status?.status_str === "error") {
        writeFileSync(`${root}/${key}.error.json`, JSON.stringify(h, null, 2));
        throw Error("Qwen alpha engine failure");
      }
      if (h?.status?.completed) {
        output = await client.image(h.outputs.output.images[0]);
        break;
      }
      await delay(500);
    }
    assert.ok(
      output,
      "Qwen alpha timed out; inspect engine history before resuming",
    );
    writeFileSync(`${root}/${key}.png`, output);
    const meta = await sharp(output).metadata();
    const expectedWidth =
      geometry === "matched-area"
        ? Math.round(Math.sqrt((768 * 768 * width) / height) / 32) * 32
        : width;
    const expectedHeight =
      geometry === "matched-area"
        ? Math.round(Math.sqrt((768 * 768 * height) / width) / 32) * 32
        : height;
    assert.equal(meta.width, expectedWidth);
    assert.equal(meta.height, expectedHeight);
    const pixels = await sharp(output)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    let alphaError = 0,
      count = 0,
      transparent = 0,
      semitransparent = 0;
    for (let i = 0; i < width * height; i++) {
      const a = pixels[i * 4 + 3]!;
      if (a === 0) transparent++;
      else if (a < 255) semitransparent++;
      const x = i % width,
        y = Math.floor(i / width);
      if (x >= 142 && x < 240 && y >= 240 && y < 280) {
        alphaError += Math.abs(a - truth.data[i * 4 + 3]!);
        count++;
      }
    }
    reports.push({
      key,
      prompt,
      promptId,
      ms: Date.now() - started,
      width,
      height,
      nativeWidth: meta.width,
      nativeHeight: meta.height,
      channels: meta.channels,
      transparent,
      semitransparent,
      interiorAlphaMAE: alphaError / count,
      sourceHash: createHash("sha256").update(source).digest("hex"),
      outputHash: createHash("sha256").update(output).digest("hex"),
      graphHash: graphHash(compiled),
      engineFingerprint: inspection.status.fingerprint,
      models: manifest.models.map((m) => ({
        filename: m.filename,
        sha256: m.sha256,
      })),
      visualReview: "pending",
      enabled: false,
    });
    writeFileSync(reportPath, JSON.stringify(reports, null, 2) + "\n");
    console.log(JSON.stringify(reports.at(-1)));
  }
