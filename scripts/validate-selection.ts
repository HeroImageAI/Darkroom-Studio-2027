import * as fs from "node:fs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { Store } from "../apps/api/src/store.js";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  prepareSelection,
  selectionPixels,
} from "../apps/api/src/selection.js";
const root = "data/scope-qa";
mkdirSync(root, { recursive: true });
const store = new Store(root + "/selection-store"),
  client = new ComfyClient(config.comfyUrl, config.instance),
  project = store.createProject("Subject selection correction QA");
const reports: any[] = fs.existsSync(root + "/selection-runs.json")
  ? JSON.parse(fs.readFileSync(root + "/selection-runs.json", "utf8"))
  : [];
try {
  for (const [name, path, point] of [
    ["portrait", "data/scope-qa/astronaut.png", { x: 250, y: 340 }],
    ["product", "data/create-qa/reference-1.png", { x: 384, y: 400 }],
  ] as const) {
    if (reports.some((r) => r.name === name)) continue;
    const bytes = readFileSync(path),
      asset = await store.importAsset(bytes, name + ".png", project.id),
      doc = store.createDocument(project.id, asset.id),
      start = Date.now();
    const selected = await prepareSelection(store, client, doc.id, {
      expectedRevision: doc.currentRevisionId,
      mode: "replace",
      subject: true,
      point,
    });
    if (!selected.selectionMaskAssetId) throw Error("No subject found");
    const mask = await selectionPixels(store, {
      ...doc.snapshot,
      selectionMaskAssetId: selected.selectionMaskAssetId,
    });
    const raw = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < mask.length; i++)
      if (mask[i]) {
        raw.data[i * 4] = Math.round(raw.data[i * 4]! * 0.65 + 255 * 0.35);
        raw.data[i * 4 + 1] = Math.round(raw.data[i * 4 + 1]! * 0.65);
        raw.data[i * 4 + 2] = Math.round(raw.data[i * 4 + 2]! * 0.65);
      }
    writeFileSync(
      root + "/" + name + ".selection.png",
      await sharp(raw.data, { raw: raw.info }).png().toBuffer(),
    );
    writeFileSync(
      root + "/" + name + ".mask.png",
      store.assetBytes(selected.selectionMaskAssetId),
    );
    const report = {
      name,
      ms: Date.now() - start,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      selectedPixels: mask.filter((v) => v > 0).length,
      masterUnchanged:
        store.document(doc.id)!.currentRevisionId === doc.currentRevisionId,
      visualReview: "pending",
    };
    reports.push(report);
    console.log(JSON.stringify(report));
    writeFileSync(
      root + "/selection-runs.json",
      JSON.stringify(reports, null, 2),
    );
  }
} finally {
  store.close();
}
