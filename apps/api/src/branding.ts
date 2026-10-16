import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import opentype, { type Font } from "opentype.js";
import sharp from "sharp";
import { z } from "zod";
import {
  sanitizeSvg,
  safePaint,
  xmlEscape,
} from "../../../packages/document/src/svg.js";
import type { Snapshot } from "../../../packages/document/src/schema.js";
import type { Store } from "./store.js";
import { renderMaster } from "./edit-render.js";
const fonts: Record<string, { font: Font; sha256: string }> = {};
export const fontNames = ["Darkroom Sans", "Darkroom Sans Bold"] as const;
for (const [i, name] of fontNames.entries()) {
  const bytes = readFileSync(
    `node_modules/@fontsource/inter/files/inter-latin-${i ? 700 : 400}-normal.woff`,
  );
  fonts[name] = {
    font: opentype.parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export const fontIdentity = () =>
  Object.fromEntries(
    Object.entries(fonts).map(([name, v]) => [name, v.sha256]),
  );
export const textOutlineSchema = z.object({
  text: z
    .string()
    .max(500)
    .refine((s) => !/[\r\n\t]/.test(s), "Use one line per text layer"),
  fontFamily: z.enum(fontNames),
  fontSize: z.number().min(1).max(512),
});
export function textOutline(input: unknown) {
  const r = textOutlineSchema.parse(input),
    { font, sha256 } = fonts[r.fontFamily]!;
  for (const c of r.text)
    if (
      !/[\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2122]/.test(
        c,
      ) ||
      !font.charToGlyphIndex(c)
    )
      throw Error(
        `The bundled font does not contain ${JSON.stringify(c)}. Choose supported Latin text; no font substitution was made.`,
      );
  // Deliberate single-line Latin layout. Read glyphs directly rather than using
  // unvalidated complex-script substitution; screen and delivery share this path.
  const commands: ReturnType<Font["getPath"]>["commands"] = [];
  let advance = 0;
  let previous: ReturnType<Font["charToGlyph"]> | undefined;
  for (const c of r.text) {
    const glyph = font.charToGlyph(c),
      scale = r.fontSize / font.unitsPerEm;
    if (previous) advance += font.getKerningValue(previous, glyph) * scale;
    commands.push(...glyph.getPath(advance, r.fontSize, r.fontSize).commands);
    advance += (glyph.advanceWidth ?? 0) * scale;
    previous = glyph;
  }
  const number = (n: number) => {
    if (!Number.isFinite(n)) throw Error("Invalid text geometry");
    return Number(n.toFixed(4));
  };
  const d = commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${number(c.x)} ${number(c.y)}`;
        case "C":
          return `C${number(c.x1)} ${number(c.y1)} ${number(c.x2)} ${number(c.y2)} ${number(c.x)} ${number(c.y)}`;
        case "Q":
          return `Q${number(c.x1)} ${number(c.y1)} ${number(c.x)} ${number(c.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
  return {
    path: d,
    width: advance,
    height: r.fontSize * 1.3,
    fontHash: sha256,
  };
}
export async function importLogo(
  store: Store,
  projectId: string,
  input: string,
) {
  const logo = sanitizeSvg(input);
  const bytes = await sharp(Buffer.from(logo.svg)).png().toBuffer();
  const asset = await store.importAsset(
    bytes,
    "SVG logo preview.png",
    projectId,
  );
  return { ...logo, asset };
}
export async function documentSvg(store: Store, doc: Snapshot) {
  if (doc.width * doc.height > 16000000)
    throw Error("Branding export supports up to 16 million pixels");
  const layers: string[] = [];
  let rasterImages = 0;
  for (const l of doc.layers.filter((l) => l.visible)) {
    let body = "";
    if ("assetId" in l) {
      const a = store.asset(l.assetId);
      if (!a) throw Error("Layer image missing");
      if (l.vectorSvg && !l.maskAssetId && !l.maskStrokes?.length) {
        body = sanitizeSvg(l.vectorSvg).svg;
      } else {
        rasterImages++;
        const png = await sharp(store.assetBytes(a.id))
          .autoOrient()
          .png()
          .toBuffer();
        const id = "m" + l.id;
        let mask = "";
        if (l.maskAssetId)
          mask += `<image href="data:image/png;base64,${(await sharp(store.assetBytes(l.maskAssetId)).png().toBuffer()).toString("base64")}" width="${a.width}" height="${a.height}" preserveAspectRatio="none"/>`;
        for (const s of l.maskStrokes ?? [])
          mask +=
            s.points.length === 1
              ? `<circle cx="${s.points[0]!.x}" cy="${s.points[0]!.y}" r="${s.size / 2}" fill="${s.reveal ? "white" : "black"}"/>`
              : `<polyline points="${s.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${s.reveal ? "white" : "black"}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
        body = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${a.width}" height="${a.height}" style="mask-type:luminance"><rect width="${a.width}" height="${a.height}" fill="white"/>${mask}</mask></defs><image href="data:image/png;base64,${png.toString("base64")}" width="${a.width}" height="${a.height}" mask="url(#${id})"/>`;
      }
    } else if (l.type === "text") {
      body = `<path d="${textOutline(l).path}" fill="${safePaint(l.fill)}"/>`;
    } else {
      const attrs = `fill="${safePaint(l.fill)}" stroke="${safePaint(l.stroke)}" stroke-width="${l.strokeWidth}"`;
      body =
        l.shape === "rectangle"
          ? `<rect width="${l.width}" height="${l.height}" ${attrs}/>`
          : `<ellipse cx="${l.width / 2}" cy="${l.height / 2}" rx="${l.width / 2}" ry="${l.height / 2}" ${attrs}/>`;
    }
    const t = l.transform;
    layers.push(
      `<g opacity="${l.opacity}" transform="translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})">${body}</g>`,
    );
  }
  const bytes = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}"><title>${xmlEscape("Darkroom artwork; text outlined; raster images remain raster")}</title>${layers.join("")}</svg>`,
  );
  return { bytes, rasterImages };
}
export async function renderDelivery(store: Store, doc: Snapshot) {
  if (
    !doc.layers.some(
      (l) =>
        l.visible && (l.type === "text" || ("vectorSvg" in l && l.vectorSvg)),
    )
  )
    return renderMaster(store, doc);
  return sharp((await documentSvg(store, doc)).bytes)
    .png()
    .toBuffer();
}
