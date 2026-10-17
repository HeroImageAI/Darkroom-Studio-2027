import type { Snapshot } from "./schema.js";
export type Layer = Snapshot["layers"][number];
export type Point = { x: number; y: number };
export function localPoint(p: Point, t: Layer["transform"]): Point {
  const a = (-t.rotation * Math.PI) / 180;
  const x = p.x - t.x,
    y = p.y - t.y;
  return {
    x: (x * Math.cos(a) - y * Math.sin(a)) / t.scaleX,
    y: (x * Math.sin(a) + y * Math.cos(a)) / t.scaleY,
  };
}
export function cropDocument(
  doc: Snapshot,
  rect: { x: number; y: number; width: number; height: number },
): Snapshot {
  const x = Math.max(0, Math.min(doc.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(doc.height - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(doc.width - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(doc.height - y, Math.round(rect.height)));
  const { selection: _, selectionMaskAssetId: _mask, ...rest } = doc;
  return {
    ...rest,
    width,
    height,
    layers: doc.layers.map((l) => ({
      ...l,
      transform: { ...l.transform, x: l.transform.x - x, y: l.transform.y - y },
    })),
  };
}
export function updateLayer(
  doc: Snapshot,
  id: string,
  change: Partial<Layer>,
): Snapshot {
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      l.id === id && !l.locked
        ? ({ ...l, ...change, id: l.id, type: l.type } as Layer)
        : l,
    ),
  };
}
export function historyCommit(
  past: Snapshot[],
  present: Snapshot,
  next: Snapshot,
) {
  return JSON.stringify(present) === JSON.stringify(next)
    ? past
    : [...past.slice(-49), present];
}
