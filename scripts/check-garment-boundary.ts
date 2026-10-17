// Fixture-only experiment. Does not change or enable automatic selection.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "data/quality-gaps";
mkdirSync(root, { recursive: true });
const bytes = readFileSync("data/scope-qa/astronaut.png");
const annotation = JSON.parse(
  readFileSync("tests/golden/garment-protection.json", "utf8"),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  annotation.sourceSha256,
);
const src = await sharp(bytes)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: w, height: h } = src.info;
assert.equal(w, annotation.width);
assert.equal(h, annotation.height);
const mask = await sharp("data/scope-qa/sam-garment.mask.png")
  .removeAlpha()
  .greyscale()
  .threshold(128)
  .raw()
  .toBuffer();
const fg = await sharp("data/scope-qa/portrait.mask.png")
  .removeAlpha()
  .greyscale()
  .raw()
  .toBuffer();
const outside = new Uint8Array(w * h),
  queue = new Int32Array(w * h);
let a = 0,
  b = 0;
const visit = (i: number) => {
  if (!mask[i] && !outside[i]) {
    outside[i] = 1;
    queue[b++] = i;
  }
};
for (let x = 0; x < w; x++) {
  visit(x);
  visit((h - 1) * w + x);
}
for (let y = 0; y < h; y++) {
  visit(y * w);
  visit(y * w + w - 1);
}
while (a < b) {
  const i = queue[a++]!,
    x = i % w,
    y = Math.floor(i / w);
  if (x) visit(i - 1);
  if (x + 1 < w) visit(i + 1);
  if (y) visit(i - w);
  if (y + 1 < h) visit(i + w);
}
const candidate = Buffer.from(mask);
let added = 0;
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i] || !outside[i] || fg[i]! < 224) continue;
    let match = false;
    for (let dy = -2; dy <= 2 && !match; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 4) continue;
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!mask[j]) continue;
        const dif = [0, 1, 2].map((c) =>
          Math.abs(src.data[i * 4 + c]! - src.data[j * 4 + c]!),
        );
        if (Math.max(...dif) <= 24 && dif.reduce((a, b) => a + b, 0) <= 42) {
          match = true;
          break;
        }
      }
    if (match) {
      candidate[i] = 255;
      added++;
    }
  }
const body =
  annotation.polygons
    .map(
      (p: number[][]) =>
        `<polygon points="${p.map((p) => p.join(",")).join(" ")}" fill="white"/>`,
    )
    .join("") +
  annotation.circles
    .map(
      (c: { x: number; y: number; r: number }) =>
        `<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="white"/>`,
    )
    .join("");
const protectedPng = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="black"/>${body}</svg>`,
  ),
)
  .removeAlpha()
  .greyscale()
  .threshold(1)
  .png()
  .toBuffer();
const protectedPixels = await sharp(protectedPng)
  .removeAlpha()
  .greyscale()
  .raw()
  .toBuffer();
assert.equal(protectedPixels.length, mask.length);
assert.equal(fg.length, mask.length);
const reviewed = Buffer.from(candidate);
let overlaps = 0,
  subtracted = 0;
const overlay = Buffer.from(src.data);
for (let i = 0; i < mask.length; i++) {
  if (candidate[i] && !mask[i] && protectedPixels[i]) overlaps++;
  if (protectedPixels[i]) {
    if (reviewed[i]) subtracted++;
    reviewed[i] = 0;
  }
  if (reviewed[i]) {
    overlay[i * 4] = Math.round(overlay[i * 4]! * 0.6 + 102);
    overlay[i * 4 + 1] = Math.round(overlay[i * 4 + 1]! * 0.6);
    overlay[i * 4 + 2] = Math.round(overlay[i * 4 + 2]! * 0.6);
  }
}
for (const [name, pixels] of [
  ["candidate", candidate],
  ["reviewed", reviewed],
] as const)
  writeFileSync(
    `${root}/garment-boundary.${name}.png`,
    await sharp(pixels, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer(),
  );
writeFileSync(`${root}/garment-boundary.protected.png`, protectedPng);
writeFileSync(
  `${root}/garment-boundary.review.png`,
  await sharp(overlay, { raw: src.info }).png().toBuffer(),
);
const report = {
  sourceHash: annotation.sourceSha256,
  added,
  proposedPixelsInProtectedRegions: overlaps,
  manuallySubtractedPixels: subtracted,
  automaticPromotion: false,
  assessment:
    "Reject automatic growth: reaches protected regions. Reviewed mask uses explicit fixture-specific annotations; inspect before any live edit.",
};
writeFileSync(
  `${root}/garment-boundary.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
