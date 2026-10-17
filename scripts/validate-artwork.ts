// Owned, analytically projected design: controlled perspective QA, not a photo benchmark.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import { textOutline } from "../apps/api/src/branding.js";
import {
  prepareArtwork,
  reviewArtwork,
  artworkHistory,
} from "../apps/api/src/artwork.js";
const root = "data/artwork-qa";
mkdirSync(root, { recursive: true });
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const title = textOutline({
  text: "DARKROOM",
  fontFamily: "Darkroom Sans Bold",
  fontSize: 42,
});
const subtitle = textOutline({
  text: "STUDIO 2027",
  fontFamily: "Darkroom Sans",
  fontSize: 24,
});
const truth = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#f2eee3"/><rect x="12" y="12" width="376" height="216" fill="none" stroke="#e31824" stroke-width="4"/><path d="M36 43H124L80 83Z" fill="#e31824"/><g transform="translate(36 100)" fill="#14161a"><path d="${title.path}"/></g><g transform="translate(38 158)" fill="#14161a"><path d="${subtitle.path}"/></g><path d="M38 202H360" stroke="#45484e" stroke-width="3"/></svg>`,
  ),
)
  .ensureAlpha()
  .raw()
  .toBuffer();
const width = 480,
  height = 300,
  projected = Buffer.alloc(width * height * 4);
// Explicit known projective matrix [400 60 60; 30 220 50; .2 .15 1].
// Solve its two linear equations independently; do not use the production mapper.
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    projected.set([41, 44, 49, 255], i);
    const a = 400 - 0.2 * x,
      b = 60 - 0.15 * x,
      c = 30 - 0.2 * y,
      d = 220 - 0.15 * y;
    const determinant = a * d - b * c;
    const u = ((x - 60) * d - b * (y - 50)) / determinant;
    const v = (a * (y - 50) - (x - 60) * c) / determinant;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const sx = u * 399,
      sy = v * 239,
      x0 = Math.floor(sx),
      y0 = Math.floor(sy),
      tx = sx - x0,
      ty = sy - y0;
    for (let ch = 0; ch < 3; ch++) {
      const at = (xx: number, yy: number) => truth[(yy * 400 + xx) * 4 + ch]!;
      projected[i + ch] = Math.round(
        at(x0, y0) * (1 - tx) * (1 - ty) +
          at(Math.min(399, x0 + 1), y0) * tx * (1 - ty) +
          at(x0, Math.min(239, y0 + 1)) * (1 - tx) * ty +
          at(Math.min(399, x0 + 1), Math.min(239, y0 + 1)) * tx * ty,
      );
    }
  }
const source = await sharp(projected, { raw: { width, height, channels: 4 } })
  .png()
  .toBuffer();
writeFileSync(
  `${root}/truth.png`,
  await sharp(truth, { raw: { width: 400, height: 240, channels: 4 } })
    .png()
    .toBuffer(),
);
writeFileSync(`${root}/owned-angle-artwork.png`, source);
const corners = [
  { x: 60, y: 50 },
  { x: 460 / 1.2, y: 80 / 1.2 },
  { x: 520 / 1.35, y: 300 / 1.35 },
  { x: 120 / 1.15, y: 270 / 1.15 },
];
const seed = process.argv.includes("--seed-preview"),
  measure = process.argv.includes("--measure-live");
if ((seed || measure) && !process.env.DR_DATA_DIR)
  throw Error("Set DR_DATA_DIR explicitly to the isolated preview workspace");
const store = new Store(
  seed || measure ? process.env.DR_DATA_DIR! : `${root}/store`,
);
try {
  if (seed) {
    const path = `${root}/preview-${hash(source).slice(0, 12)}.json`;
    if (existsSync(path)) {
      const previous = JSON.parse(readFileSync(path, "utf8"));
      assert.ok(
        store.document(previous.documentId),
        "Retained preview fixture missing; inspect before creating another",
      );
      assert.equal(
        hash(
          store.assetBytes(
            store.document(previous.documentId)!.originalAssetId,
          ),
        ),
        hash(source),
      );
      console.log(JSON.stringify(previous));
    } else {
      const project = store.createProject(
        "Artwork QA · perspective " + hash(source).slice(0, 6),
      );
      const asset = await store.importAsset(
        source,
        "Owned angled artwork.png",
        project.id,
      );
      const doc = store.createDocument(project.id, asset.id);
      const report = {
        projectId: project.id,
        documentId: doc.id,
        revisionId: doc.currentRevisionId,
        sourceHash: hash(source),
        corners,
        width: 400,
        height: 240,
      };
      writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify(report));
    }
    writeFileSync(`${root}/preview-source.json`, readFileSync(path));
  } else {
    let record, original;
    if (measure) {
      const seeded = JSON.parse(
        readFileSync(`${root}/preview-source.json`, "utf8"),
      );
      original = store.document(seeded.documentId)!;
      assert.equal(
        original.currentRevisionId,
        seeded.revisionId,
        "UI must leave the source master unchanged",
      );
      record = artworkHistory(store, original.id).find(
        (r) => r.disposition === "saved",
      );
      assert.ok(record, "Save the QA artwork copy through the UI first");
    } else {
      const project = store.createProject("Controlled artwork QA");
      const asset = await store.importAsset(
        source,
        "Owned angled artwork.png",
        project.id,
      );
      original = store.createDocument(project.id, asset.id);
      const candidate = await prepareArtwork(store, {
        documentId: original.id,
        expectedRevision: original.currentRevisionId,
        corners,
        width: 400,
        height: 240,
        idempotencyKey: randomUUID(),
      });
      record = reviewArtwork(store, candidate.id, "save-copy");
    }
    const result = store.assetBytes(record.assetId),
      pixels = await sharp(result).ensureAlpha().raw().toBuffer();
    let error = 0,
      n = 0;
    for (let y = 5; y < 235; y++)
      for (let x = 5; x < 395; x++)
        for (let ch = 0; ch < 3; ch++) {
          const i = (y * 400 + x) * 4 + ch;
          error += Math.abs(pixels[i]! - truth[i]!);
          n++;
        }
    assert.ok(
      error / n < 8,
      "Controlled artwork fidelity exceeds the declared tolerance",
    );
    assert.equal(
      hash(store.assetBytes(original.originalAssetId)),
      hash(source),
    );
    assert.equal(
      store.document(original.id)!.currentRevisionId,
      original.currentRevisionId,
    );
    writeFileSync(
      `${root}/${measure ? "ui" : "controlled"}.result.png`,
      result,
    );
    const report = {
      schemaVersion: 1,
      scope:
        "Owned analytically projected flat design; no curved-fabric or photographic certification",
      record,
      originalRevisionUnchanged: true,
      originalBytesUnchanged: true,
      interiorRGBMAE: error / n,
      designText: "DARKROOM / STUDIO 2027",
      visualReview: "pending",
    };
    writeFileSync(
      `${root}/${measure ? "ui" : "controlled"}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  }
} finally {
  store.close();
}
