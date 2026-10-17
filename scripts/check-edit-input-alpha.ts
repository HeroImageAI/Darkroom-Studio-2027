// Isolate alpha handling versus reference-guide framing. Never enables a route.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflowById } from "../apps/api/src/workflow.js";
import { bind, graphHash, preflight } from "../packages/workflows/src/bind.js";
import { editPrompt } from "../packages/routing/src/edit-template.js";
import { protectRequestedEdit } from "../apps/api/src/edit-render.js";
const origin = process.env.DR_QA_ORIGIN;
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Set the isolated loopback QA origin");
const root = "data/windows-image-acceptance/alpha-check";
mkdirSync(root, { recursive: true });
const state = JSON.parse(
  readFileSync("data/windows-image-acceptance/run.json", "utf8"),
);
assert.equal(state.origin, origin, "QA workspace changed");
const edits = await (
  await fetch(origin + "/api/documents/" + state.documentId + "/edits")
).json();
const row = edits.find((e: any) => e.jobId === state.actions.Recolour.jobId);
const asset = async (id: string) => {
  const r = await fetch(origin + "/api/assets/" + id);
  assert.ok(r.ok);
  return Buffer.from(await r.arrayBuffer());
};
const source = await asset(row.sourceAssetId),
  mask = await asset(row.maskAssetId),
  request = state.actions.Recolour.request;
const flattened = await sharp(source)
  .flatten({ background: "white" })
  .png()
  .toBuffer();
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
assert.ok(inspection.status.verified);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const reports: any[] = existsSync(root + "/report.json")
  ? JSON.parse(readFileSync(root + "/report.json", "utf8"))
  : [];
for (const variant of [
  "flattened-two-ref",
  "flattened-one-ref",
  "native-two-ref",
  "cache-off-two-ref",
  "klein-one-ref",
  "klein-two-ref",
]) {
  if (
    reports.some(
      (r) =>
        r.variant === variant &&
        r.sourceHash === hash(source) &&
        r.maskHash === hash(mask) &&
        r.engineFingerprint === inspection.status.fingerprint,
    )
  )
    continue;
  const q = await client.queue();
  assert.equal(q.queue_running.length + q.queue_pending.length, 0);
  const refs = [
    await client.uploadReference(flattened),
    await client.uploadReference(mask),
  ];
  const { graph, manifest } = workflowById(
    variant.startsWith("klein-")
      ? variant.endsWith("two-ref")
        ? "create.klein.2ref"
        : "create.klein.1ref"
      : variant.endsWith("two-ref")
        ? "create.qwen.2ref"
        : "create.qwen.1ref",
  );
  const compiled = bind(graph, manifest, {
    prompt: variant.endsWith("two-ref")
      ? editPrompt(request)
      : request.instruction,
    width: 1024,
    height: 1024,
    seed: 20271017,
    steps: variant.startsWith("klein-") ? 4 : 40,
    reference1: refs[0]!,
    ...(variant.endsWith("two-ref") ? { reference2: refs[1]! } : {}),
  });
  if (variant === "native-two-ref") {
    compiled.prompt!.inputs.resolution = 0;
    compiled.sample!.inputs.latent_image = ["prompt", 2];
  }
  if (variant === "cache-off-two-ref") {
    compiled.cache = {
      class_type: "QwenImage21Cache",
      _meta: { title: "DR_DIAGNOSTIC_CACHE" },
      inputs: { model: ["model", 0], device: "off", dtype: "default" },
    };
    compiled.sample!.inputs.model = ["cache", 0];
  }
  preflight(
    compiled,
    { ...manifest, graphSha256: graphHash(compiled) },
    await client.json("/object_info"),
    new Set(refs),
  );
  const start = Date.now(),
    promptId = await client.submit(compiled, randomUUID());
  console.log(variant + " " + promptId);
  writeFileSync(
    root + "/" + variant + ".graph.json",
    JSON.stringify(compiled, null, 2),
  );
  let complete = false;
  while (Date.now() - start < 300000) {
    const h = await client.history(promptId);
    if (h?.status?.status_str === "error") {
      writeFileSync(
        root + "/" + variant + ".error.json",
        JSON.stringify(h, null, 2),
      );
      throw Error("Engine failed");
    }
    if (h?.status?.completed) {
      const raw = await client.image(h.outputs.output.images[0]),
        result = await protectRequestedEdit(source, mask, raw, "Recolour");
      writeFileSync(root + "/" + variant + ".raw.png", raw);
      writeFileSync(root + "/" + variant + ".png", result);
      reports.push({
        variant,
        promptId,
        ms: Date.now() - start,
        sourceHash: hash(source),
        flattenedHash: hash(flattened),
        maskHash: hash(mask),
        rawHash: hash(raw),
        resultHash: hash(result),
        graphHash: graphHash(compiled),
        engineFingerprint: inspection.status.fingerprint,
        prompt: variant.endsWith("two-ref")
          ? editPrompt(request)
          : request.instruction,
        seed: 20271017,
        steps: variant.startsWith("klein-") ? 4 : 40,
        visualReview: "pending",
      });
      writeFileSync(root + "/report.json", JSON.stringify(reports, null, 2));
      complete = true;
      break;
    }
    await delay(500);
  }
  assert.ok(complete, "Timed out; inspect engine before retrying");
}

const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
const maskPixels = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
for (const report of reports) {
  const pixels = await sharp(readFileSync(root + "/" + report.variant + ".png"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  let protectedPixels = 0;
  assert.equal(pixels.length, sourcePixels.length);
  for (let i = 0; i < maskPixels.length; i++) {
    assert.equal(pixels[i * 4 + 3], sourcePixels[i * 4 + 3]);
    if (!maskPixels[i]) {
      assert.deepEqual(
        pixels.subarray(i * 4, i * 4 + 4),
        sourcePixels.subarray(i * 4, i * 4 + 4),
      );
      protectedPixels++;
    }
  }
  Object.assign(report, {
    protectedPixels,
    protectedExact: true,
    alphaExact: true,
  });
}
writeFileSync(root + "/report.json", JSON.stringify(reports, null, 2));
