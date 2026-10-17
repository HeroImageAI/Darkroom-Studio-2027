import { expect, it } from "vitest";
import {
  perspectiveMap,
  straightenRgba,
} from "../../packages/document/src/perspective.js";
const rectangle = [
  { x: 0, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 3 },
  { x: 0, y: 3 },
];
it("retains every pixel including hidden RGB in an identity rectification", () => {
  const source = Uint8Array.from({ length: 64 }, (_, i) => (i * 17) % 256);
  source[3] = 0;
  expect(straightenRgba(source, 4, 4, rectangle, 4, 4)).toEqual(source);
});
it("uses projective rather than bilinear geometry for a trapezoid", () => {
  const corners = [
    { x: 2, y: 1 },
    { x: 6, y: 1 },
    { x: 8, y: 5 },
    { x: 0, y: 5 },
  ];
  const map = perspectiveMap(corners, 9, 6);
  for (const [i, uv] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].entries()) {
    expect(map(uv[0]!, uv[1]!)).toEqual(corners[i]);
  }
  expect(map(0.5, 0.5).x).toBeCloseTo(4);
  expect(map(0.5, 0.5).y).toBeCloseTo(7 / 3);
  const source = new Uint8Array(9 * 6 * 4);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 9; x++) {
      const i = (y * 9 + x) * 4;
      source.set([x * 20, y * 30, 80, 255], i);
    }
  expect([
    ...straightenRgba(source, 9, 6, corners, 3, 3).slice(16, 20),
  ]).toEqual([80, 70, 80, 255]);
});
it("interpolates alpha in premultiplied colour to avoid transparent-edge halos", () => {
  const source = Uint8Array.from([
    255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0,
  ]);
  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  expect([...straightenRgba(source, 2, 2, corners, 3, 2).slice(4, 8)]).toEqual([
    255, 0, 0, 128,
  ]);
});
it("rejects crossing, reversed, collapsed and out-of-source outlines and oversized output", () => {
  for (const points of [
    [rectangle[0]!, rectangle[2]!, rectangle[1]!, rectangle[3]!],
    [...rectangle].reverse(),
    rectangle.map(() => ({ x: 1, y: 1 })),
    rectangle.map((p) => ({ x: p.x + 10, y: p.y })),
  ])
    expect(() => perspectiveMap(points, 4, 4)).toThrow();
  expect(() =>
    straightenRgba(new Uint8Array(64), 4, 4, rectangle, 8192, 8192),
  ).toThrow("16 million");
});
