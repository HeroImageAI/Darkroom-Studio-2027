import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import {
  textOutline,
  documentSvg,
  importLogo,
  renderDelivery,
} from "../../apps/api/src/branding.js";
import {
  createHandoff,
  handoffRecord,
  importProject,
} from "../../apps/api/src/handoff.js";
import { createExport } from "../../apps/api/src/finish.js";
import { sanitizeSvg } from "../../packages/document/src/svg.js";
let store: Store, root: string;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "branding-"));
  store = new Store(root);
});
afterEach(() => {
  store.db.close();
  rmSync(root, { recursive: true, force: true });
});
const logo =
  '<svg width="100" height="80" viewBox="0 0 100 80"><path d="M10 10L90 10L50 70Z" fill="#e31824"/></svg>';
async function fixture() {
  const project = store.createProject("Owned branding");
  const a = await store.importAsset(
    await sharp({
      create: { width: 512, height: 256, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer(),
    "owned.png",
    project.id,
  );
  let doc = store.createDocument(project.id, a.id);
  const imported = await importLogo(store, project.id, logo);
  const base = {
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
  };
  doc = store.saveDocument(doc.id, doc.currentRevisionId, {
    ...doc.snapshot,
    layers: [
      { ...doc.snapshot.layers[0]!, visible: false },
      {
        ...base,
        id: randomUUID(),
        name: "Exact text",
        type: "text",
        text: "DARKROOM",
        fontFamily: "Darkroom Sans Bold",
        fontSize: 40,
        fill: "#111111",
      },
      {
        ...base,
        id: randomUUID(),
        name: "Shape",
        type: "vector",
        shape: "rectangle",
        width: 100,
        height: 60,
        fill: "#245ad0",
        stroke: "#000000",
        strokeWidth: 0,
        transform: { ...base.transform, x: 20, y: 100 },
      },
      {
        ...base,
        id: randomUUID(),
        name: "Logo",
        type: "raster",
        assetId: imported.asset.id,
        vectorSvg: imported.svg,
        transform: {
          ...base.transform,
          x: 300,
          y: 100,
          scaleX: 1.5,
          scaleY: 1.5,
        },
      },
    ],
  });
  return { project, a, doc };
}
it("uses bundled glyph outlines and rejects font substitution or missing glyphs", () => {
  const regular = textOutline({
      text: "DARKROOM",
      fontFamily: "Darkroom Sans",
      fontSize: 40,
    }),
    bold = textOutline({
      text: "DARKROOM",
      fontFamily: "Darkroom Sans Bold",
      fontSize: 40,
    });
  expect(regular.width).toBeGreaterThan(200);
  expect(regular.width).toBeLessThan(300);
  expect(regular.path).toMatch(/^M/);
  expect(regular.path).not.toContain("NaN");
  expect(bold.path).not.toBe(regular.path);
  expect(bold.fontHash).not.toBe(regular.fontHash);
  expect(() =>
    textOutline({ text: "NOIR", fontFamily: "Imaginary Font", fontSize: 40 }),
  ).toThrow();
  expect(() =>
    textOutline({ text: "漢字", fontFamily: "Darkroom Sans", fontSize: 40 }),
  ).toThrow("does not contain");
});
it("keeps SVG geometry vector, outlines text and renders positions/alpha consistently in PNG", async () => {
  const { doc } = await fixture();
  const svg = await documentSvg(store, doc.snapshot);
  expect(svg.rasterImages).toBe(0);
  expect(svg.bytes.toString()).not.toContain("<text");
  expect(svg.bytes.toString()).not.toContain("data:image/");
  expect(svg.bytes.toString()).toContain("scale(1.5 1.5)");
  expect(svg.bytes.toString()).toContain("M10 10L90 10L50 70Z");
  const bytes = await renderDelivery(store, doc.snapshot),
    pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
  const pixel = (x: number, y: number) => [
    ...pixels.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4),
  ];
  expect(pixel(50, 130)).toEqual([36, 90, 208, 255]);
  expect(pixel(375, 130)).toEqual([227, 24, 36, 255]);
  expect(pixel(0, 0)[3]).toBe(0);
  const exported = await createExport(store, {
    documentId: doc.id,
    expectedRevision: doc.currentRevisionId,
    idempotencyKey: randomUUID(),
    format: "png",
    width: 512,
    height: 256,
    transparent: true,
    background: "#ffffff",
    quality: 95,
    density: 300,
  });
  expect(
    await sharp(store.assetBytes(exported.assetId))
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ).toEqual(pixels);
});
it("native project reopens editable layers and byte-identical images with identical rendered output", async () => {
  const { doc, a } = await fixture(),
    request = {
      documentId: doc.id,
      expectedRevision: doc.currentRevisionId,
      format: "darkroom",
      idempotencyKey: randomUUID(),
    };
  const record = await createHandoff(store, request);
  expect((await createHandoff(store, request)).id).toBe(record.id);
  const bundle = JSON.parse(
    Buffer.from(
      handoffRecord(store, record.id)!.bytes as Uint8Array,
    ).toString(),
  );
  const idempotencyKey = randomUUID();
  const [copy, concurrent] = await Promise.all([
    importProject(store, { bundle, idempotencyKey }),
    importProject(store, { bundle, idempotencyKey }),
  ]);
  expect(concurrent.document.id).toBe(copy.document.id);
  expect(
    (await importProject(store, { bundle, idempotencyKey })).document.id,
  ).toBe(copy.document.id);
  expect(copy.document.id).not.toBe(doc.id);
  expect(copy.document.snapshot.layers[1]!.type).toBe("text");
  expect(copy.document.snapshot.layers[1]).toMatchObject({
    text: "DARKROOM",
    fontFamily: "Darkroom Sans Bold",
    fontSize: 40,
  });
  expect(store.assetBytes(copy.document.originalAssetId)).toEqual(
    store.assetBytes(a.id),
  );
  expect(
    await sharp(await renderDelivery(store, copy.document.snapshot))
      .raw()
      .toBuffer(),
  ).toEqual(
    await sharp(await renderDelivery(store, doc.snapshot))
      .raw()
      .toBuffer(),
  );
  expect(store.document(doc.id)!.currentRevisionId).toBe(doc.currentRevisionId);
});
it("rejects stale handoff, tampered project and changed retry without creating an imported project", async () => {
  const { doc } = await fixture(),
    r = {
      documentId: doc.id,
      expectedRevision: randomUUID(),
      format: "svg",
      idempotencyKey: randomUUID(),
    };
  await expect(createHandoff(store, r)).rejects.toThrow("Master changed");
  const handoff = await createHandoff(store, {
    ...r,
    expectedRevision: doc.currentRevisionId,
    format: "darkroom",
  });
  await expect(
    createHandoff(store, {
      ...r,
      expectedRevision: doc.currentRevisionId,
      format: "svg",
    }),
  ).rejects.toThrow("retry");
  const bundle = JSON.parse(
    Buffer.from(
      handoffRecord(store, handoff.id)!.bytes as Uint8Array,
    ).toString(),
  );
  bundle.assets[0].hash = "0".repeat(64);
  const count = store.projects().length;
  await expect(
    importProject(store, { bundle, idempotencyKey: randomUUID() }),
  ).rejects.toThrow("checksum");
  expect(store.projects()).toHaveLength(count);
});
it("rejects active, linked, font-dependent and unsupported SVG instead of stripping artwork", () => {
  expect(sanitizeSvg(logo).svg).toContain("M10 10");
  for (const body of [
    "<script>alert(1)</script>",
    '<image href="https://example.com/a.png"/>',
    '<rect width="10" height="10" onclick="alert(1)"/>',
    "<foreignObject/>",
    "<text>NOIR</text>",
    '<defs><linearGradient id="g"/></defs>',
    '<path d="M0 0" style="fill:url(https://example.com)"/>',
  ])
    expect(() =>
      sanitizeSvg(`<svg width="100" height="80">${body}</svg>`),
    ).toThrow();
  expect(() =>
    sanitizeSvg(
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg width="100" height="80">&x;</svg>',
    ),
  ).toThrow();
  expect(() => sanitizeSvg('<svg width="100%" height="80"></svg>')).toThrow();
});

it("matches the placed logo viewport when SVG dimensions round to raster pixels", async () => {
  const { project, doc } = await fixture();
  const imported = await importLogo(
    store,
    project.id,
    '<svg width="50.5" height="20.5" viewBox="0 0 50.5 20.5"><rect width="50.5" height="20.5" fill="#e31824"/></svg>',
  );
  const layer = {
    ...doc.snapshot.layers[0]!,
    id: randomUUID(),
    visible: true,
    locked: false,
    assetId: imported.asset.id,
    vectorSvg: imported.svg,
    transform: { x: 0, y: 0, scaleX: 10, scaleY: 10, rotation: 0 },
  };
  const rendered = await sharp(
    (
      await documentSvg(store, {
        ...doc.snapshot,
        width: 600,
        height: 300,
        layers: [layer],
      })
    ).bytes,
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alpha = (x: number, y: number) => rendered[(y * 600 + x) * 4 + 3];
  expect(alpha(imported.asset.width * 10 - 2, 100)).toBe(255);
  expect(alpha(imported.asset.width * 10 + 2, 100)).toBe(0);
  expect(alpha(100, imported.asset.height * 10 - 2)).toBe(255);
  expect(alpha(100, imported.asset.height * 10 + 2)).toBe(0);
});
