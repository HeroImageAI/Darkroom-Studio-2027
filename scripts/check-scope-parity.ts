import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import { renderMaster } from "../apps/api/src/edit-render.js";
import { finishOutput } from "../apps/api/src/finish-workflows.js";
import { finishSignature } from "../apps/api/src/finish-readiness.js";
import { editSignature } from "../packages/routing/src/edit-policy.js";
const baseline = "apps/api/src/.scope-baseline.ts";
writeFileSync(
  baseline,
  execFileSync("git", [
    "show",
    "0dd3a9767efd8ef50ca04d5333fb2f37d48a1189:apps/api/src/edit-render.ts",
  ]),
);
const old = await import(
  new URL("../apps/api/src/.scope-baseline.ts", import.meta.url).href
);
mkdirSync("data/scope-qa", { recursive: true });
const store = new Store("data/scope-qa/parity-store"),
  project = store.createProject("Owned renderer regression");
const bytes = await sharp({
  create: {
    width: 128,
    height: 96,
    channels: 4,
    background: { r: 60, g: 90, b: 120, alpha: 0.7 },
  },
})
  .png()
  .toBuffer();
const asset = await store.importAsset(bytes, "owned.png", project.id),
  doc = store.createDocument(project.id, asset.id);
let comparisons = 0;
try {
  for (const opacity of [0, 0.5, 1])
    for (const rotation of [0, 17]) {
      const layer = doc.snapshot.layers[0]!;
      const snapshot = {
        ...doc.snapshot,
        layers: [
          {
            ...layer,
            opacity,
            transform: { x: 10, y: -5, rotation, scaleX: 0.8, scaleY: 1.2 },
            maskStrokes: [
              { points: [{ x: 50, y: 40 }], size: 24, reveal: false },
            ],
          },
        ],
      };
      assert.deepEqual(
        await sharp(await renderMaster(store, snapshot))
          .raw()
          .toBuffer(),
        await sharp(await old.renderMaster(store, snapshot))
          .raw()
          .toBuffer(),
      );
      comparisons++;
    }
  const restored = JSON.parse(
    readFileSync("data/restore-qa/runs.json", "utf8"),
  );
  for (const r of restored) {
    const prefix = "data/restore-qa/" + r.name;
    const result = await finishOutput(
      readFileSync(prefix + ".before.png"),
      readFileSync(prefix + ".raw.png"),
      "Restore",
      r.size,
      r.size,
      r.preserve,
    );
    assert.deepEqual(
      await sharp(result).raw().toBuffer(),
      await sharp(readFileSync(prefix + ".result.png"))
        .raw()
        .toBuffer(),
    );
    comparisons++;
  }
  const cases = [
    { name: "Remove-background", task: "Remove background", size: 384 },
    { name: "Upscale", task: "Upscale", size: 768 },
    { name: "Upscale-384-4x", task: "Upscale", size: 1536 },
  ];
  for (const r of cases) {
    const prefix = "data/finish-qa/" + r.name;
    const expected = readFileSync(prefix + ".result.png"),
      meta = await sharp(expected).metadata();
    const result = await finishOutput(
      readFileSync(prefix + ".before.png"),
      readFileSync(prefix + ".raw.png"),
      r.task as any,
      meta.width!,
      meta.height!,
    );
    assert.deepEqual(
      await sharp(result).raw().toBuffer(),
      await sharp(expected).raw().toBuffer(),
    );
    comparisons++;
  }
  const result = {
    comparisons,
    passed: true,
    editSignature: editSignature(),
    finishSignature: finishSignature(),
    scope:
      "Existing raster output parity and recomposition of retained GPU evidence; new branding and selection integration covered separately.",
  };
  writeFileSync(
    "workflows/scope-corrections-parity.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  store.close();
  unlinkSync(baseline);
}
