// Pinned real photograph and a fixture-specific reviewed mask, never an automatic mask claim.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import {
  prepareArtwork,
  reviewArtwork,
  artworkHistory,
} from "../apps/api/src/artwork.js";
import { renderDelivery } from "../apps/api/src/branding.js";
import { selectionPixels } from "../apps/api/src/selection.js";
const root = "data/artwork-isolation-qa";
mkdirSync(root, { recursive: true });
const fixture = JSON.parse(
  readFileSync("tests/golden/artwork-selection.json", "utf8"),
);
const source = readFileSync(fixture.source);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
assert.equal(
  hash(source),
  fixture.sourceSha256,
  "Annotation does not belong to this photograph",
);
const seed = process.argv.includes("--seed-preview"),
  measure = process.argv.includes("--measure-live");
if ((seed || measure) && !process.env.DR_DATA_DIR)
  throw Error("Set DR_DATA_DIR explicitly to the isolated preview");
const store = new Store(
  seed || measure ? process.env.DR_DATA_DIR! : `${root}/store`,
);
try {
  const seedPath = `${root}/preview-source.json`;
  let doc;
  if ((seed || measure) && existsSync(seedPath)) {
    const prior = JSON.parse(readFileSync(seedPath, "utf8"));
    doc = store.document(prior.documentId);
    assert.ok(doc, "Preview fixture missing; inspect before recreating");
    assert.equal(
      doc.currentRevisionId,
      prior.revisionId,
      "The source master must remain unchanged",
    );
    assert.equal(
      hash(store.assetBytes(doc.originalAssetId)),
      fixture.sourceSha256,
    );
  } else {
    assert.ok(!measure, "Seed the isolated preview fixture first");
    const project = store.createProject("Artwork QA · photographic isolation");
    const asset = await store.importAsset(
      source,
      "NASA photographic badge source.png",
      project.id,
    );
    const initial = store.createDocument(project.id, asset.id);
    doc = store.saveDocument(initial.id, initial.currentRevisionId, {
      ...initial.snapshot,
      selection: fixture.selection,
    });
    if (seed)
      writeFileSync(
        seedPath,
        JSON.stringify(
          {
            projectId: project.id,
            documentId: doc.id,
            revisionId: doc.currentRevisionId,
            sourceHash: fixture.sourceSha256,
            corners: fixture.corners,
            width: fixture.outputWidth,
            height: fixture.outputHeight,
          },
          null,
          2,
        ) + "\n",
      );
  }
  if (seed) {
    console.log(readFileSync(seedPath, "utf8"));
  } else {
    const mask = await selectionPixels(store, doc.snapshot);
    const rgba = await sharp(await renderDelivery(store, doc.snapshot))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const records = [];
    for (const useSelection of measure ? [true] : [false, true]) {
      let record;
      if (measure) {
        record = artworkHistory(store, doc.id).find(
          (r) => r.selectionMaskHash && r.disposition === "saved",
        );
        assert.ok(
          record,
          "Save the isolated artwork through the live UI first",
        );
      } else {
        const candidate = await prepareArtwork(store, {
          documentId: doc.id,
          expectedRevision: doc.currentRevisionId,
          corners: fixture.corners,
          width: fixture.outputWidth,
          height: fixture.outputHeight,
          ...(useSelection ? { useSelection: true } : {}),
          idempotencyKey: randomUUID(),
        });
        record = reviewArtwork(store, candidate.id, "save-copy");
      }
      const png = store.assetBytes(record.assetId),
        pixels = await sharp(png).ensureAlpha().raw().toBuffer();
      let selected = 0,
        removed = 0;
      for (let y = 0; y < fixture.outputHeight; y++)
        for (let x = 0; x < fixture.outputWidth; x++) {
          const sx = x + fixture.corners[0].x,
            sy = y + fixture.corners[0].y;
          const from = (sy * fixture.width + sx) * 4,
            to = (y * fixture.outputWidth + x) * 4;
          if (!useSelection || mask[sy * fixture.width + sx]) {
            assert.deepEqual(
              pixels.subarray(to, to + 4),
              rgba.subarray(from, from + 4),
            );
            selected++;
          } else {
            assert.equal(pixels[to + 3], 0);
            removed++;
          }
        }
      assert.equal(
        store.document(doc.id)!.currentRevisionId,
        doc.currentRevisionId,
      );
      assert.equal(
        hash(store.assetBytes(doc.originalAssetId)),
        fixture.sourceSha256,
      );
      writeFileSync(
        `${root}/${measure ? "ui" : useSelection ? "isolated" : "plate"}.png`,
        png,
      );
      records.push({
        record,
        selectedRGBAExact: selected,
        removedPixelsTransparent: removed,
        originalRevisionUnchanged: true,
        originalBytesUnchanged: true,
        visualReview: "pending",
      });
    }
    const report = {
      schemaVersion: 1,
      scope:
        "One manually outlined photographic badge; no automatic segmentation, restored lettering or fabric flattening claim",
      source: {
        ...fixture,
        rights:
          "NASA/public domain, as recorded in tests/golden/photo-sources.json",
      },
      records,
    };
    writeFileSync(
      `${root}/${measure ? "ui" : "runs"}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  }
} finally {
  store.close();
}
