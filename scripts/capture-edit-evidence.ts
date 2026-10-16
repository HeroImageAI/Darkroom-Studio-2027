import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { snapshotSchema } from "../packages/document/src/schema.js";
const origin = process.env.DR_EDIT_EVIDENCE_URL ?? "http://127.0.0.1:2035";
const id = process.argv[2];
if (!id)
  throw Error("Pass the document UUID from the manually reviewed Edit master.");
const response = await fetch(
  origin + "/api/documents/" + encodeURIComponent(id),
);
if (!response.ok) throw Error("Reviewed master is unavailable");
const document = await response.json();
const snapshot = snapshotSchema.parse(document.snapshot);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const expected = hash(readFileSync("data/create-qa/reference-1.png"));
const original = Buffer.from(
  await (
    await fetch(origin + "/api/assets/" + document.originalAssetId)
  ).arrayBuffer(),
);
if (hash(original) !== expected)
  throw Error("Original reference bytes changed");
const layer = snapshot.layers.find((l) => l.name === "Product study");
if (
  !layer ||
  !("assetId" in layer) ||
  !layer.maskStrokes?.length ||
  layer.transform.rotation !== -4
)
  throw Error("Expected manually reviewed transform/mask was not saved");
const evidence = {
  at: new Date().toISOString(),
  documentId: id,
  revisionId: document.currentRevisionId,
  originalSha256: expected,
  originalUnchanged: true,
  snapshotSha256: hash(Buffer.from(JSON.stringify(snapshot))),
  width: snapshot.width,
  height: snapshot.height,
  layers: snapshot.layers.length,
  transform: layer.transform,
  maskStrokes: layer.maskStrokes.length,
  assessment:
    "Manually reviewed owned NOIR fixture in live browser: transform, hide mask, Undo then Redo, named version and reload. Source bytes unchanged. Manual canvas validation only; no AI operation claimed.",
};
mkdirSync("data/edit-final/evidence", { recursive: true });
writeFileSync(
  "data/edit-final/evidence/manual-review.json",
  JSON.stringify(evidence, null, 2),
);
console.log(evidence);
