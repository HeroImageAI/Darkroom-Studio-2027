import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { finishOutput, finishInput } from "../apps/api/src/finish-workflows.js";
const root = "data/quality-gaps/realesrgan",
  runs: object[] = [],
  tiles = [];
for (const [j, fixture] of ["graphic", "portrait"].entries()) {
  const source = readFileSync(
    "data/quality-gaps/finish-alpha" +
      (fixture === "portrait" ? "/portrait" : "") +
      "/source.png",
  );
  const { resized } = await finishInput(source, "Upscale", 512, 512),
    a = await sharp(resized).ensureAlpha().raw().toBuffer();
  const baseline = readFileSync(
    `data/quality-gaps/finish-colour/${fixture}-Upscale-lab.result.png`,
  );
  const result = await finishOutput(
    source,
    readFileSync(`${root}/${fixture}-Upscale.raw.png`),
    "Upscale",
    512,
    512,
  );
  for (const [name, bytes] of [
    ["SeedVR2-lab", baseline],
    ["RealESRGAN", result],
  ] as const) {
    const b = await sharp(bytes).ensureAlpha().raw().toBuffer();
    let t = 0,
      tn = 0,
      o = 0,
      on = 0;
    for (let i = 0; i < 512 * 512; i++) {
      assert.equal(a[i * 4 + 3], b[i * 4 + 3]);
      for (let c = 0; c < 3; c++) {
        const e = Math.abs(a[i * 4 + c]! - b[i * 4 + c]!);
        if (a[i * 4 + 3]! >= 64 && a[i * 4 + 3]! < 255) {
          t += e;
          tn++;
        }
        if (a[i * 4 + 3] === 255) {
          o += e;
          on++;
        }
      }
    }
    runs.push({
      fixture,
      model: name,
      translucentRgbMae: t / tn,
      opaqueRgbMae: o / on,
      alphaExact: true,
      outputHash: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  writeFileSync(`${root}/${fixture}-Upscale.result.png`, result);
  for (const [x, bytes] of [resized, baseline, result].entries())
    tiles.push({
      input: await sharp(bytes)
        .resize(256, 256)
        .flatten({ background: "#808080" })
        .png()
        .toBuffer(),
      left: x * 256,
      top: j * 256,
    });
}
await sharp({
  create: { width: 768, height: 512, channels: 3, background: "black" },
})
  .composite(tiles)
  .png()
  .toFile(`${root}/review.png`);
const source = readFileSync("data/scope-qa/low-quality-image.before.png"),
  raw = readFileSync(`${root}/degraded-Restore.raw.png`),
  reference = await sharp("data/scope-qa/astronaut.png")
    .ensureAlpha()
    .raw()
    .toBuffer();
const preserve = [
  { x: 145, y: 15 },
  { x: 310, y: 15 },
  { x: 315, y: 195 },
  { x: 145, y: 195 },
];
const result = await finishOutput(source, raw, "Restore", 512, 512, preserve);
writeFileSync(`${root}/degraded-Restore.result.png`, result);
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
const before = await sharp(source).ensureAlpha().raw().toBuffer(),
  after = await sharp(result).ensureAlpha().raw().toBuffer();
let error = 0,
  n = 0,
  protectedPixels = 0;
for (let i = 0; i < mask.length; i++) {
  if (mask[i]) {
    assert.ok(
      before
        .subarray(i * 4, i * 4 + 4)
        .equals(after.subarray(i * 4, i * 4 + 4)),
    );
    protectedPixels++;
  } else
    for (let c = 0; c < 3; c++) {
      error += (after[i * 4 + c]! - reference[i * 4 + c]!) ** 2;
      n++;
    }
}
runs.push({
  fixture: "degraded-portrait",
  model: "RealESRGAN",
  outsidePsnr: 10 * Math.log10(255 ** 2 / (error / n)),
  protectedPixels,
  protectedRgbaExact: true,
  scope: "Protected head remains at source quality; no face-repair claim.",
});
writeFileSync(
  `${root}/comparison.json`,
  JSON.stringify(
    {
      scope:
        "Same source and requested dimensions; different SR architectures and native working resolutions. Timings are not comparable pipeline benchmarks.",
      runs,
    },
    null,
    2,
  ) + "\n",
);
console.log(runs);
