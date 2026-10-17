// Owned vector/text fixture for live branding and native-project handoff checks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const origin = process.env.DR_BRANDING_URL ?? "http://127.0.0.1:2045";
const root = "data/branding-release/evidence";
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
const project = await post("/projects", {
  name: "Branding validation · DARKROOM",
});
const blank = await sharp({
  create: {
    width: 900,
    height: 560,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .png()
  .toBuffer();
const form = new FormData();
form.append(
  "file",
  new Blob([new Uint8Array(blank)], { type: "image/png" }),
  "DARKROOM brand canvas.png",
);
const response = await fetch(origin + "/api/assets?projectId=" + project.id, {
  method: "POST",
  headers: { "x-darkroom-token": token },
  body: form,
});
if (!response.ok) throw Error(await response.text());
const asset = await response.json();
let doc = await post("/projects/" + project.id + "/documents", {
  assetId: asset.id,
});
const logo = await post("/logos", {
  projectId: project.id,
  svg: readFileSync("apps/web/public/mark.svg", "utf8"),
});
const base = (name: string, x: number, y: number) => ({
  id: randomUUID(),
  name,
  visible: true,
  locked: false,
  opacity: 1,
  transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
});
const text = (
  name: string,
  value: string,
  x: number,
  y: number,
  size: number,
  bold = false,
) => ({
  ...base(name, x, y),
  type: "text",
  text: value,
  fontFamily: bold ? "Darkroom Sans Bold" : "Darkroom Sans",
  fontSize: size,
  fill: "#f2f2f3",
});
const snapshot = {
  ...doc.snapshot,
  layers: [
    { ...doc.snapshot.layers[0], visible: false },
    {
      ...base("Background", 0, 0),
      type: "vector",
      shape: "rectangle",
      width: 900,
      height: 560,
      fill: "#08090b",
      stroke: "#08090b",
      strokeWidth: 0,
      locked: true,
    },
    {
      ...base("Darkroom logo", 80, 84),
      type: "raster",
      assetId: logo.asset.id,
      vectorSvg: logo.svg,
      transform: { x: 80, y: 84, scaleX: 4, scaleY: 4, rotation: 0 },
    },
    text("Title", "DARKROOM", 240, 90, 70, true),
    text("Subtitle", "STUDIO 2027", 245, 174, 26),
    {
      ...base("Crimson rule", 82, 284),
      type: "vector",
      shape: "rectangle",
      width: 64,
      height: 4,
      fill: "#e31824",
      stroke: "#e31824",
      strokeWidth: 0,
    },
    text("Tagline", "CREATE. EDIT. FINISH.", 80, 335, 22),
    {
      ...base("Frame", 660, 320),
      type: "vector",
      shape: "ellipse",
      width: 160,
      height: 160,
      fill: "none",
      stroke: "#e31824",
      strokeWidth: 2,
    },
    text("Footer", "EXACT ARTWORK / LOCAL AI", 80, 467, 14),
  ],
};
doc = await post(
  "/documents/" + doc.id,
  { expectedRevision: doc.currentRevisionId, snapshot },
  "PATCH",
);
writeFileSync(
  root + "/live.json",
  JSON.stringify(
    {
      rights: "Original Darkroom mark and owned geometric/text fixture",
      projectId: project.id,
      documentId: doc.id,
      baseRevision: doc.currentRevisionId,
      assetId: asset.id,
      visualAssessment: "PENDING browser and Affinity review",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ projectId: project.id, documentId: doc.id }));
