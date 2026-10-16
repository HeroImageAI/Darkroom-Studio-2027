import { it, expect } from "vitest";
import { preflight, graphHash } from "../../packages/workflows/src/bind.js";
import type {
  Graph,
  Manifest,
  ObjectInfo,
} from "../../packages/workflows/src/manifest.js";
const graph: Graph = {
  ref: {
    class_type: "LoadImage",
    _meta: { title: "DR_REF_1" },
    inputs: { image: "darkroom-studio-2027/references/owned.png" },
  },
  encode: {
    class_type: "TextEncodeQwenImage21",
    _meta: { title: "DR_OUTPUT" },
    inputs: { "images.image_1": ["ref", 0] },
  },
};
const manifest: Manifest = {
  schemaVersion: 1,
  id: "test",
  version: "1",
  modelFamily: "Qwen",
  referenceCount: 1,
  graphSha256: graphHash(graph),
  bindings: {
    reference1: { title: "DR_REF_1", input: "image", type: "string" },
  },
  outputs: [{ title: "DR_OUTPUT", kind: "image", alpha: false }],
  models: [],
  maxPixels: 1572864,
  enabled: false,
  validationEvidenceId: null,
};
const info: ObjectInfo = {
  LoadImage: {
    input: { required: { image: [["unrelated.png"], { image_upload: true }] } },
    output: ["IMAGE", "MASK"],
  },
  TextEncodeQwenImage21: {
    input: {
      required: {
        images: [
          "COMFY_AUTOGROW_V3",
          {
            template: {
              names: ["image_1", "image_2", "image_3"],
              min: 0,
              input: { required: { image: ["IMAGE"] } },
            },
          },
        ],
      },
    },
    output: ["CONDITIONING"],
  },
};
it("validates Qwen autogrow references and trusted upload receipts", () => {
  expect(() => preflight(graph, manifest, info)).toThrow("Unavailable");
  expect(
    preflight(
      graph,
      manifest,
      info,
      new Set(["darkroom-studio-2027/references/owned.png"]),
    ).ready,
  ).toBe(true);
});
it("rejects unadvertised dynamic image slots and bad link types", () => {
  const invalid = structuredClone(graph);
  invalid.encode!.inputs = { "images.image_99": ["ref", 0] };
  expect(() =>
    preflight(
      invalid,
      { ...manifest, graphSha256: graphHash(invalid) },
      info,
      new Set([String(graph.ref!.inputs.image)]),
    ),
  ).toThrow("Unknown node input");
  const bad = structuredClone(graph);
  bad.encode!.inputs = { "images.image_1": ["ref", 1] };
  expect(() =>
    preflight(
      bad,
      { ...manifest, graphSha256: graphHash(bad) },
      info,
      new Set([String(graph.ref!.inputs.image)]),
    ),
  ).toThrow("Incompatible");
});
