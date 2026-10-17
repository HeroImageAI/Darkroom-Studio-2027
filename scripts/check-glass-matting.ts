// Necessary controlled transparency check, not photographic glass certification.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  finishGraph,
  finishOutput,
  preflightFinish,
} from "../apps/api/src/finish-workflows.js";
import {
  finishModelHashes,
  finishEvidence,
  finishNodeFingerprint,
} from "../apps/api/src/finish-readiness.js";
const root = "data/quality-gaps/glass-matting";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  stats = await client.json("/system_stats"),
  info = await client.json("/object_info");
if (
  !config.instance ||
  !(stats.system?.argv ?? []).some(
    (s: string) =>
      s.includes("instance-model-paths") &&
      s.includes(config.instance + ".yaml"),
  )
)
  throw Error("Verified Desktop required");
const models = await finishModelHashes();
assert.deepEqual(models, finishEvidence().modelHashes);
assert.equal(finishNodeFingerprint(info), finishEvidence().nodeFingerprint);
const width = 384,
  height = 512;
const truth = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="M168 64H216V180C216 196 272 210 272 248V448Q272 468 250 468H134Q112 468 112 448V248C112 210 168 196 168 180Z" fill="#b9d8e8" fill-opacity="0.15" stroke="#b9d8e8" stroke-opacity="0.65" stroke-width="8"/><rect x="164" y="40" width="56" height="28" rx="4" fill="#202428"/><rect x="140" y="300" width="104" height="60" rx="3" fill="#faf8ed"/><path d="M160 320H224M160 332H215M160 344H224" stroke="#202428" stroke-width="4"/></svg>`,
  ),
)
  .png()
  .toBuffer();
writeFileSync(`${root}/truth.png`, truth);
const expected = await sharp(truth).ensureAlpha().raw().toBuffer();
const runs: object[] = [];
for (const [name, background] of [
  ["white", "#ffffff"],
  ["blue", "#8eacc8"],
] as const) {
  const source = await sharp(truth).flatten({ background }).png().toBuffer();
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy");
  const uploaded = await client.uploadReference(source),
    graph = finishGraph("Remove background", uploaded);
  preflightFinish(graph, info, uploaded);
  const start = Date.now(),
    promptId = await client.submit(graph, randomUUID());
  let raw: Buffer | undefined;
  while (Date.now() - start < 180000) {
    const h = await client.history(promptId);
    if (h?.status?.status_str === "error") throw Error("Glass check failed");
    if (h?.status?.completed) {
      raw = await client.image(h.outputs["99"].images[0]);
      break;
    }
    await delay(500);
  }
  if (!raw) throw Error("Glass check timed out");
  const result = await finishOutput(
    source,
    raw,
    "Remove background",
    width,
    height,
  );
  const before = await sharp(source).ensureAlpha().raw().toBuffer(),
    after = await sharp(result).ensureAlpha().raw().toBuffer();
  let error = 0,
    predicted = 0,
    target = 0,
    n = 0,
    label = 0,
    ln = 0;
  for (let i = 0; i < width * height; i++) {
    assert.ok(
      before
        .subarray(i * 4, i * 4 + 3)
        .equals(after.subarray(i * 4, i * 4 + 3)),
    );
    const x = i % width,
      y = Math.floor(i / width);
    if (x >= 142 && x < 240 && y >= 240 && y < 280) {
      error += Math.abs(after[i * 4 + 3]! - expected[i * 4 + 3]!);
      predicted += after[i * 4 + 3]!;
      target += expected[i * 4 + 3]!;
      n++;
    }
    if (x >= 144 && x < 240 && y >= 304 && y < 356) {
      label += after[i * 4 + 3]!;
      ln++;
    }
  }
  const tiles = [];
  for (const [y, bytes] of [truth, result].entries())
    for (const [x, bg] of ["#ffffff", "#808080", "#101010"].entries())
      tiles.push({
        input: await sharp(bytes)
          .resize(192, 256)
          .flatten({ background: bg })
          .png()
          .toBuffer(),
        left: x * 192,
        top: y * 256,
      });
  await sharp({
    create: { width: 576, height: 512, channels: 3, background: "black" },
  })
    .composite(tiles)
    .png()
    .toFile(`${root}/${name}.review.png`);
  for (const [suffix, bytes] of [
    ["source", source],
    ["mask", raw],
    ["result", result],
  ] as const)
    writeFileSync(`${root}/${name}.${suffix}.png`, bytes);
  runs.push({
    name,
    background,
    promptId,
    ms: Date.now() - start,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    outputHash: createHash("sha256").update(result).digest("hex"),
    sourceRgbExact: true,
    interiorAlphaMae: error / n,
    predictedInteriorAlpha: predicted / n,
    expectedInteriorAlpha: target / n,
    labelAlpha: label / ln,
    visualReview: "pending",
  });
  console.log(JSON.stringify(runs.at(-1)));
}
writeFileSync(
  `${root}/runs.json`,
  JSON.stringify(
    {
      engineVersion: stats.system.comfyui_version,
      modelHashes: models,
      nodeFingerprint: finishNodeFingerprint(info),
      scope:
        "Owned synthetic bottle with known alpha on two input backgrounds; necessary transparency check only. Single-image glass decomposition is ambiguous; no model or enabled workflow change.",
      runs,
    },
    null,
    2,
  ) + "\n",
);
