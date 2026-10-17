import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { protectRequestedEdit } from "../apps/api/src/edit-render.js";
import { editSignature } from "../packages/routing/src/edit-policy.js";

const baselineCommit = "5166a47da7684de11494b842e9ef7bcd8ea012c8";
const baselinePath = "apps/api/src/.quality-baseline.ts";
const root = "data/quality-gaps";
mkdirSync(root, { recursive: true });
writeFileSync(
  baselinePath,
  execFileSync("git", [
    "show",
    `${baselineCommit}:apps/api/src/edit-render.ts`,
  ]),
);
const comparisons: object[] = [];
try {
  const old = await import(
    new URL("../apps/api/src/.quality-baseline.ts", import.meta.url).href
  );
  for (const task of [
    "Background",
    "Remove",
    "Replace",
    "Recolour",
    "Expand",
    "Instruct",
  ]) {
    const prefix = `data/edit-qa/${task}`;
    const inputs = ["before", "mask", "raw"].map((s) =>
      readFileSync(`${prefix}.${s}.png`),
    );
    const before = await old.protectRequestedEdit(
      inputs[0]!,
      inputs[1]!,
      inputs[2]!,
      task,
    );
    const after = await protectRequestedEdit(
      inputs[0]!,
      inputs[1]!,
      inputs[2]!,
      task,
    );
    const a = await sharp(after).ensureAlpha().raw().toBuffer();
    const b = await sharp(before).ensureAlpha().raw().toBuffer();
    let rgbChanged = 0,
      alphaChanged = 0;
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) {
        if (i % 4 === 3) alphaChanged++;
        else rgbChanged++;
      }
    console.log({ task, rgbChanged, alphaChanged });
    assert.equal(rgbChanged, 0, task + " RGB parity");
    if (task === "Recolour") {
      const source = await sharp(inputs[0]!).ensureAlpha().raw().toBuffer();
      for (let i = 3; i < a.length; i += 4) assert.equal(a[i], source[i]);
    } else assert.equal(alphaChanged, 0, task + " alpha parity");
    comparisons.push({
      task,
      rgbParity: true,
      alphaChanged,
      sourceAlphaExact: task === "Recolour" ? true : undefined,
      rawHash: createHash("sha256").update(inputs[2]!).digest("hex"),
    });
  }
  // Owned cutout fixture with deliberately translucent coverage, not a glass-matting claim.
  const source = await sharp(readFileSync("data/edit-qa/Recolour.before.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = await sharp(readFileSync("data/edit-qa/Recolour.mask.png"))
    .greyscale()
    .raw()
    .toBuffer();
  const { width, height } = source.info;
  for (let i = 0; i < mask.length; i++)
    source.data[i * 4 + 3] = Math.round(((i % width) * 255) / (width - 1));
  const png = await sharp(source.data, { raw: source.info }).png().toBuffer();
  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  const raw = readFileSync("data/edit-qa/Recolour.raw.png");
  const result = await protectRequestedEdit(png, maskPng, raw, "Recolour");
  const after = await sharp(result).ensureAlpha().raw().toBuffer();
  let changed = 0,
    protectedPixels = 0;
  for (let i = 0; i < mask.length; i++) {
    assert.equal(after[i * 4 + 3], source.data[i * 4 + 3]);
    if (!mask[i] || !source.data[i * 4 + 3]) {
      assert.deepEqual(
        after.subarray(i * 4, i * 4 + 4),
        source.data.subarray(i * 4, i * 4 + 4),
      );
      protectedPixels++;
    } else if (
      !after
        .subarray(i * 4, i * 4 + 3)
        .equals(source.data.subarray(i * 4, i * 4 + 3))
    )
      changed++;
  }
  assert.ok(changed > 0);
  writeFileSync(`${root}/translucent-recolour.before.png`, png);
  writeFileSync(`${root}/translucent-recolour.result.png`, result);
  writeFileSync(
    "workflows/recolour-alpha-validation.json",
    JSON.stringify(
      {
        baselineCommit,
        implementationSha256: editSignature(),
        comparisons,
        translucentCoverage: {
          pixels: mask.length,
          alphaExact: true,
          protectedPixels,
          protectedPixelsExact: true,
          changedColourPixels: changed,
        },
        scope:
          "Deterministic compositor checks using retained GPU results and owned synthetic alpha ramp; does not validate glass extraction or garment selection quality.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      comparisons: comparisons.length,
      alphaPixels: mask.length,
      changed,
      protectedPixels,
    }),
  );
} finally {
  unlinkSync(baselinePath);
}
