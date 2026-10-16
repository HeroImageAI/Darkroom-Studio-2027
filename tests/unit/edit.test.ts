import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  initialSnapshot,
  snapshotSchema,
} from "../../packages/document/src/schema.js";
import {
  cropDocument,
  localPoint,
  updateLayer,
  historyCommit,
} from "../../packages/document/src/edit.js";
const fixture = () =>
  initialSnapshot(
    randomUUID(),
    { id: randomUUID(), width: 640, height: 480 },
    randomUUID(),
  );
it("maps mask coordinates through rotation and independent scales", () => {
  const p = localPoint(
    { x: 80, y: 70 },
    { x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 4 },
  );
  expect(p.x).toBeCloseTo(10);
  expect(p.y).toBeCloseTo(5);
});
it("crop changes the viewport and preserves off-canvas layer pixels and mask coordinates", () => {
  const doc = fixture();
  doc.layers[0]!.transform.rotation = 25;
  const next = cropDocument(doc, { x: 50, y: 30, width: 400, height: 300 });
  expect(next.width).toBe(400);
  expect(next.height).toBe(300);
  expect(next.layers[0]!.transform).toEqual({
    ...doc.layers[0]!.transform,
    x: -50,
    y: -30,
  });
  expect(doc.width).toBe(640);
  expect(doc.layers[0]!.transform.x).toBe(0);
  expect(
    cropDocument(doc, { x: 600, y: 460, width: 500, height: 300 }),
  ).toMatchObject({ width: 40, height: 20 });
});
it("locked layers resist property changes and the history cap retains meaningful states", () => {
  const doc = fixture(),
    l = doc.layers[0]!;
  expect(updateLayer(doc, l.id, { opacity: 0 }).layers[0]!.opacity).toBe(1);
  expect(historyCommit([], doc, structuredClone(doc))).toEqual([]);
  expect(
    historyCommit(Array(60).fill(doc), doc, { ...doc, width: 300 }),
  ).toHaveLength(50);
});
it("round trips bounded brush strokes and selections while accepting old masters", () => {
  const doc = fixture();
  expect(snapshotSchema.parse(doc)).toEqual(doc);
  doc.selection = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 20, y: 40 },
  ];
  const l = doc.layers[0]!;
  if ("assetId" in l)
    l.maskStrokes = [{ points: [{ x: 100, y: 150 }], size: 30, reveal: false }];
  expect(snapshotSchema.parse(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  const invalid = structuredClone(doc);
  invalid.selection![0]!.x = Infinity;
  expect(snapshotSchema.safeParse(invalid).success).toBe(false);
});
