// Opt-in real composite QA. Creates owned fixtures, submits once, never accepts a result.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const origin = process.env.DR_COMPOSITE_URL ?? "http://127.0.0.1:2044";
const root =
  process.env.DR_COMPOSITE_EVIDENCE ?? "data/composite-live/evidence";
mkdirSync(root, { recursive: true });
async function get(path: string) {
  const r = await fetch(origin + "/api" + path);
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const { token } = await get("/session");
async function post(path: string, body: unknown, method = "POST") {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-darkroom-token": token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
async function upload(bytes: Buffer, name: string, projectId: string) {
  const f = new FormData();
  f.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    name,
  );
  const r = await fetch(origin + "/api/assets?projectId=" + projectId, {
    method: "POST",
    headers: { "x-darkroom-token": token },
    body: f,
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const project = await post("/projects", {
  name: "Composite validation · NOIR",
});
const background = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="b" x2="0" y2="1"><stop stop-color="#273140"/><stop offset="1" stop-color="#070a10"/></linearGradient></defs><rect width="768" height="768" fill="url(#b)"/><path d="M0 580H768V768H0Z" fill="#343940"/></svg>',
  ),
)
  .png()
  .toBuffer();
const product = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="600"><rect x="20" y="100" width="200" height="480" rx="45" fill="#202124"/><rect x="48" y="20" width="144" height="115" rx="8" fill="#111111"/><rect x="42" y="260" width="156" height="180" rx="2" fill="#f5efe1"/><text x="120" y="343" text-anchor="middle" font-size="40" font-family="Arial" fill="#111">NOIR</text><text x="120" y="376" text-anchor="middle" font-size="13" font-family="Arial" fill="#333">EAU DE PARFUM</text></svg>',
  ),
)
  .png()
  .toBuffer();
writeFileSync(root + "/background.png", background);
writeFileSync(root + "/product.png", product);
const bg = await upload(background, "Owned studio background.png", project.id),
  bottle = await upload(product, "Owned NOIR cutout.png", project.id);
let doc = await post("/projects/" + project.id + "/documents", {
  assetId: bg.id,
});
const paint = await post("/documents/" + doc.id + "/paint", {
  expectedRevision: doc.currentRevisionId,
  colour: "#101114",
  size: 35,
  erase: false,
  points: [
    { x: 260, y: 652 },
    { x: 520, y: 652 },
  ],
});
const base = {
  visible: true,
  locked: false,
  opacity: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
};
const snapshot = {
  ...doc.snapshot,
  layers: [
    ...doc.snapshot.layers,
    {
      ...base,
      id: randomUUID(),
      name: "Rough shadow",
      type: "paint",
      assetId: paint.id,
    },
    {
      ...base,
      id: randomUUID(),
      name: "NOIR cutout",
      type: "raster",
      assetId: bottle.id,
      transform: { ...base.transform, x: 264, y: 74 },
    },
  ],
  selection: [
    { x: 312, y: 94 },
    { x: 456, y: 94 },
    { x: 456, y: 177 },
    { x: 468, y: 185 },
    { x: 479, y: 198 },
    { x: 484, y: 219 },
    { x: 484, y: 609 },
    { x: 479, y: 630 },
    { x: 468, y: 645 },
    { x: 439, y: 654 },
    { x: 329, y: 654 },
    { x: 300, y: 645 },
    { x: 289, y: 630 },
    { x: 284, y: 609 },
    { x: 284, y: 219 },
    { x: 289, y: 198 },
    { x: 300, y: 185 },
    { x: 312, y: 177 },
  ],
};
doc = await post(
  "/documents/" + doc.id,
  { expectedRevision: doc.currentRevisionId, snapshot },
  "PATCH",
);
const request = {
  documentId: doc.id,
  expectedRevision: doc.currentRevisionId,
  task: "Instruct",
  area: "outside",
  seed: 2027,
  idempotencyKey: randomUUID(),
  instruction:
    "Make this composition look like one coherent professional product photograph. Harmonise the lighting, colour, contact shadows and joins around the selected black NOIR perfume bottle. Keep the selected product, lettering and design exactly unchanged. Turn the rough dark painted line underneath into a soft realistic contact shadow on the slate surface. Keep the dark blue-grey studio background and existing framing. Do not add objects or text.",
};
const start = Date.now(),
  submitted = await post("/edits", request);
writeFileSync(
  root + "/submitted.json",
  JSON.stringify(
    {
      projectId: project.id,
      documentId: doc.id,
      jobId: submitted.jobId,
      baseRevision: doc.currentRevisionId,
    },
    null,
    2,
  ),
);
console.log("Submitted composite " + submitted.jobId);
if ((await post("/edits", request)).jobId !== submitted.jobId)
  throw Error("Replay duplicated job");
for (let n = 0; n < 600; n++) {
  const entry = (await get("/documents/" + doc.id + "/edits")).find(
    (e: any) => e.jobId === submitted.jobId,
  );
  if (["failed", "interrupted", "uncertain"].includes(entry.job.state))
    throw Error(entry.job.error);
  if (entry.job.state === "succeeded") {
    const source = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + entry.sourceAssetId)
        ).arrayBuffer(),
      ),
      result = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + entry.job.resultId)
        ).arrayBuffer(),
      ),
      mask = Buffer.from(
        await (
          await fetch(origin + "/api/assets/" + entry.maskAssetId)
        ).arrayBuffer(),
      );
    const a = await sharp(source).ensureAlpha().raw().toBuffer(),
      b = await sharp(result).ensureAlpha().raw().toBuffer(),
      m = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
    let protectedPixels = 0,
      changedPixels = 0;
    for (let i = 0; i < m.length; i++) {
      const equal = a
        .subarray(i * 4, i * 4 + 4)
        .equals(b.subarray(i * 4, i * 4 + 4));
      if (m[i] === 0) {
        protectedPixels++;
        if (!equal) throw Error("Protected pixels changed");
      } else if (!equal) changedPixels++;
    }
    if (
      (await get("/documents/" + doc.id)).currentRevisionId !==
      doc.currentRevisionId
    )
      throw Error("Master changed before review");
    if (
      !Buffer.from(
        await (await fetch(origin + "/api/assets/" + bottle.id)).arrayBuffer(),
      ).equals(product)
    )
      throw Error("Product source changed");
    writeFileSync(root + "/before.png", source);
    writeFileSync(root + "/result.png", result);
    writeFileSync(root + "/mask.png", mask);
    const evidence = {
      at: new Date().toISOString(),
      rights: "Owned synthetic NOIR cutout, background and guidance paint",
      projectId: project.id,
      documentId: doc.id,
      jobId: submitted.jobId,
      baseRevisionId: doc.currentRevisionId,
      elapsedMs: Date.now() - start,
      protectedPixels,
      changedPixels,
      sourceHash: createHash("sha256").update(source).digest("hex"),
      outputHash: createHash("sha256").update(result).digest("hex"),
      originalPreserved: true,
      masterUnchangedBeforeReview: true,
      provenance: JSON.parse(entry.job.provenance),
      visualAssessment: "PENDING manual review",
    };
    writeFileSync(root + "/live.json", JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        state: "succeeded",
        protectedPixels,
        changedPixels,
        elapsedMs: evidence.elapsedMs,
      }),
    );
    process.exit(0);
  }
  await delay(1000);
}
throw Error("Deadline exceeded; inspect saved submission before retrying");
