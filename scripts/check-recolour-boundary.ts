import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  protectEdit,
  protectRequestedEdit,
} from "../apps/api/src/edit-render.js";
import { editSignature } from "../packages/routing/src/edit-policy.js";
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const root = "data/recolour-boundary";
mkdirSync(root, { recursive: true });
const cases = [
  {
    name: "sphere",
    source: "data/edit-qa/Recolour.before.png",
    mask: "data/edit-qa/Recolour.mask.png",
    raw: "data/quality-gaps/edit-geometry/sphere-current.raw.png",
  },
  {
    name: "garment",
    source: "data/scope-qa/garment-reviewed-boundary.before.png",
    mask: "data/scope-qa/garment-reviewed-boundary.allowed-mask.png",
    raw: "data/quality-gaps/edit-geometry/garment-current.raw.png",
  },
];
const reports = [];
for (const c of cases) {
  const source = readFileSync(c.source),
    mask = readFileSync(c.mask),
    raw = readFileSync(c.raw);
  const before = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    m = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
  for (const match of [false, true]) {
    const output = await protectEdit(source, mask, raw, match, false, true),
      name = c.name + (match ? "-matched" : "-current");
    writeFileSync(`${root}/${name}.png`, output);
    const p = await sharp(output).ensureAlpha().raw().toBuffer();
    let protectedExact = true,
      alphaExact = true,
      edgeDiff = 0,
      edgeCount = 0;
    for (let i = 0; i < m.length; i++) {
      if (
        !m[i] &&
        !before.data
          .subarray(i * 4, i * 4 + 4)
          .equals(p.subarray(i * 4, i * 4 + 4))
      )
        protectedExact = false;
      if (p[i * 4 + 3] !== before.data[i * 4 + 3]) alphaExact = false;
      if (m[i])
        for (const j of [
          i - 1,
          i + 1,
          i - before.info.width,
          i + before.info.width,
        ])
          if (j >= 0 && j < m.length && !m[j]) {
            for (let k = 0; k < 3; k++)
              edgeDiff += Math.abs(
                p[i * 4 + k]! -
                  p[j * 4 + k]! -
                  (before.data[i * 4 + k]! - before.data[j * 4 + k]!),
              );
            edgeCount += 3;
          }
    }
    reports.push({
      name,
      sourceHash: hash(source),
      maskHash: hash(mask),
      rawHash: hash(raw),
      protectedExact,
      alphaExact,
      boundaryChangeMAE: edgeDiff / edgeCount,
      outputHash: hash(output),
    });
    assert.ok(protectedExact && alphaExact);
  }
}
const parity = [];
for (const task of ["Background", "Remove", "Replace", "Expand", "Instruct"]) {
  const source = readFileSync(`data/edit-qa/${task}.before.png`),
    mask = readFileSync(`data/edit-qa/${task}.mask.png`),
    raw = readFileSync(`data/edit-qa/${task}.raw.png`);
  const old = await protectEdit(
    source,
    mask,
    raw,
    task !== "Background",
    task !== "Expand",
    false,
  );
  const current = await protectRequestedEdit(source, mask, raw, task);
  assert.deepEqual(current, old);
  parity.push({ task, outputHash: hash(current), byteIdentical: true });
}
writeFileSync(`${root}/report.json`, JSON.stringify(reports, null, 2));
writeFileSync(
  `${root}/validation.json`,
  JSON.stringify(
    {
      implementationSha256: editSignature(),
      comparisons: reports,
      unchangedTasks: parity,
      scope:
        "Retained GPU results, one synthetic sphere and one NASA garment photo. Boundary metric measures changed adjacent-pixel contrast, not overall image quality. Garment selection omissions remain open.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(reports));
