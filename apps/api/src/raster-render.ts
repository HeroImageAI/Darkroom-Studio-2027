import sharp from "sharp";
import type { Snapshot } from "../../../packages/document/src/schema.js";
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
function colour(value: string) {
  if (
    !/^(#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|none|transparent|black|white|red|green|blue)$/i.test(
      value,
    )
  )
    throw Error(
      "AI flattening currently supports simple hex or basic named vector colours only.",
    );
  return escape(value);
}
export async function renderRasterMaster(
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
      const attrs = `fill="${colour(l.fill)}" stroke="${colour(l.stroke)}" stroke-width="${l.strokeWidth}"`;
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
