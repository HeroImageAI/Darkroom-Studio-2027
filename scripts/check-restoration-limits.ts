// Retained photographic GPU evidence, not a new generation or identity certificate.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { finishOutput } from "../apps/api/src/finish-workflows.js";
const root = "data/quality-gaps/restoration-limits";
mkdirSync(root, { recursive: true });
const reference = readFileSync("data/scope-qa/astronaut.png"),
  source = readFileSync("data/scope-qa/low-quality-image.before.png"),
  raw = readFileSync("data/scope-qa/low-quality-image.raw.png");
const preserve = [
  { x: 145, y: 15 },
  { x: 310, y: 15 },
  { x: 315, y: 195 },
  { x: 145, y: 195 },
];
const result = await finishOutput(source, raw, "Restore", 512, 512, preserve);
const model = await sharp(raw).resize(512, 512).ensureAlpha().png().toBuffer();
const mask = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><polygon points="145,15 310,15 315,195 145,195" fill="white"/></svg>',
  ),
)
  .flatten({ background: "black" })
  .greyscale()
  .threshold(1)
  .raw()
  .toBuffer();
const expected = await sharp(reference).ensureAlpha().raw().toBuffer();
const rows = [];
let protectedPixels = 0;
const src = await sharp(source).ensureAlpha().raw().toBuffer(),
  out = await sharp(result).ensureAlpha().raw().toBuffer();
for (let i = 0; i < mask.length; i++)
  if (mask[i]) {
    assert.ok(
      src.subarray(i * 4, i * 4 + 4).equals(out.subarray(i * 4, i * 4 + 4)),
    );
    protectedPixels++;
  }
for (const [name, bytes] of [
  ["degraded-source", source],
  ["unprotected-model", model],
  ["protected-result", result],
] as const) {
  const data = await sharp(bytes).ensureAlpha().raw().toBuffer();
  let head = 0,
    hn = 0,
    outside = 0,
    on = 0;
  for (let i = 0; i < mask.length; i++)
    for (let c = 0; c < 3; c++) {
      const e = (data[i * 4 + c]! - expected[i * 4 + c]!) ** 2;
      if (mask[i]) {
        head += e;
        hn++;
      } else {
        outside += e;
        on++;
      }
    }
  rows.push({
    name,
    headPsnr: 10 * Math.log10(255 ** 2 / (head / hn)),
    outsidePsnr: 10 * Math.log10(255 ** 2 / (outside / on)),
  });
}
const tiles = [];
for (const [x, bytes] of [reference, source, model, result].entries())
  tiles.push({
    input: await sharp(bytes)
      .extract({ left: 145, top: 15, width: 170, height: 180 })
      .png()
      .toBuffer(),
    left: x * 170,
    top: 0,
  });
await sharp({
  create: { width: 680, height: 180, channels: 3, background: "black" },
})
  .composite(tiles)
  .png()
  .toFile(`${root}/head-review.png`);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const report = {
  sourceHash: hash(source),
  referenceHash: hash(reference),
  rawHash: hash(raw),
  outputHash: hash(result),
  protectedPixels,
  protectedRgbaExact: true,
  metrics: rows,
  scope:
    "Known-reference PSNR measures distortion, not identity or recovered detail. Existing protected head remains at degraded source quality; unprotected model output is diagnostic only and is not accepted.",
  visualReview: "pending",
};
writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + "\n");
console.log(report);
