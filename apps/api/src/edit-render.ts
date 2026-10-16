import sharp from "sharp";
import type { Snapshot } from "../../../packages/document/src/schema.js";
import type { EditRequest } from "../../../packages/contracts/src/edit.js";
import type { Store } from "./store.js";
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const svg = (w: number, h: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );
export async function renderMaster(
  store: Store,
  doc: Snapshot,
): Promise<Buffer> {
  if (doc.width * doc.height > 16000000)
    throw Error(
      "AI editing currently supports canvases up to 16 million pixels.",
    );
  const layers = [];
  for (const l of doc.layers.filter((l) => l.visible)) {
    const t = l.transform;
    let body = "";
    if ("assetId" in l) {
      const bytes = await sharp(store.assetBytes(l.assetId))
        .autoOrient()
        .png()
        .toBuffer();
      const { width: w, height: h } = await sharp(bytes).metadata();
      const mask = `m${l.id}`;
      const maskAsset = l.maskAssetId
        ? `<image href="data:image/png;base64,${(await sharp(store.assetBytes(l.maskAssetId)).png().toBuffer()).toString("base64")}" width="${w}" height="${h}" preserveAspectRatio="none"/>`
        : "";
      const strokes = (l.maskStrokes ?? [])
        .map((s) =>
          s.points.length === 1
            ? `<circle cx="${s.points[0]!.x}" cy="${s.points[0]!.y}" r="${s.size / 2}" fill="${s.reveal ? "white" : "black"}"/>`
            : `<polyline points="${s.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${s.reveal ? "white" : "black"}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("");
      body = `<defs><mask id="${mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/>${maskAsset}${strokes}</mask></defs><image href="data:image/png;base64,${bytes.toString("base64")}" width="${w}" height="${h}" mask="url(#${mask})"/>`;
    } else if (l.type === "text") {
      // Font parity needs its own validated renderer; never silently substitute a client's branding.
      throw Error(
        "AI editing a master with visible text layers is not validated yet. Hide that layer or use a raster master.",
      );
    } else {
      const attrs = `fill="${escape(l.fill)}" stroke="${escape(l.stroke)}" stroke-width="${l.strokeWidth}"`;
      body =
        l.shape === "rectangle"
          ? `<rect width="${l.width}" height="${l.height}" ${attrs}/>`
          : `<ellipse cx="${l.width / 2}" cy="${l.height / 2}" rx="${l.width / 2}" ry="${l.height / 2}" ${attrs}/>`;
    }
    layers.push(
      `<g opacity="${l.opacity}" transform="translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})">${body}</g>`,
    );
  }
  return sharp(svg(doc.width, doc.height, layers.join("")))
    .png()
    .toBuffer();
}
export async function prepareEdit(
  store: Store,
  doc: Snapshot,
  request: EditRequest,
) {
  const base = await renderMaster(store, doc),
    e = request.expand ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const width = doc.width + e.left + e.right,
    height = doc.height + e.top + e.bottom;
  if (width * height > 16000000 || width > 16384 || height > 16384)
    throw Error("Expanded canvas exceeds editing limits.");
  let source = base,
    mask: Buffer;
  if (request.task === "Expand") {
    source = await sharp(base)
      .extend({ ...e, background: { r: 96, g: 96, b: 96, alpha: 1 } })
      .png()
      .toBuffer();
    mask = await sharp(
      svg(
        width,
        height,
        `<rect width="${width}" height="${height}" fill="white"/><rect x="${e.left}" y="${e.top}" width="${doc.width}" height="${doc.height}" fill="black"/>`,
      ),
    )
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer();
  } else if (doc.selection && request.area !== "whole") {
    mask = await sharp(
      svg(
        width,
        height,
        `<rect width="${width}" height="${height}" fill="black"/><polygon points="${doc.selection.map((p) => `${p.x},${p.y}`).join(" ")}" fill="white"/>`,
      ),
    )
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer();
  } else {
    if (request.task !== "Instruct")
      throw Error(
        "Select the area to change before applying this action. For Background, select the background you want to replace.",
      );
    mask = Buffer.alloc(width * height, 255);
  }
  // Hard mask: all unselected output RGBA values must equal the base exactly.
  for (let i = 0; i < mask.length; i++) mask[i] = mask[i]! >= 128 ? 255 : 0;
  if (request.task !== "Expand" && request.area === "outside")
    for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i]!;
  if (!mask.some((v) => v === 255))
    throw Error("The selection does not cover any canvas pixels.");
  const maskPng = await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const engineWidth = Math.max(256, Math.round((width * scale) / 16) * 16),
    engineHeight = Math.max(256, Math.round((height * scale) / 16) * 16);
  return { source, maskPng, width, height, engineWidth, engineHeight };
}
export async function protectEdit(
  source: Buffer,
  maskPng: Buffer,
  generated: Buffer,
) {
  const base = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const pixels = await sharp(generated)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const mask = await sharp(maskPng).removeAlpha().greyscale().raw().toBuffer();
  for (let i = 0; i < mask.length; i++)
    if (mask[i] === 0) base.data.copy(pixels, i * 4, i * 4, i * 4 + 4);
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
