import { describe, it, expect } from "vitest";
import {
  bind,
  graphHash,
  preflight,
} from "../../packages/workflows/src/bind.js";
import type {
  Graph,
  Manifest,
  ObjectInfo,
} from "../../packages/workflows/src/manifest.js";
import { chooseRoute } from "../../packages/routing/src/policy.js";
import { intentSchema } from "../../packages/contracts/src/index.js";
import { loopbackUrl } from "../../apps/api/src/config.js";
const graph: Graph = {
  arbitrary: {
    class_type: "Text",
    _meta: { title: "DR_PROMPT" },
    inputs: { text: "original" },
  },
};
const manifest: Manifest = {
  schemaVersion: 1,
  id: "test",
  version: "1",
  modelFamily: "Klein",
  graphSha256: graphHash(graph),
  bindings: { prompt: { title: "DR_PROMPT", input: "text", type: "string" } },
  outputs: [{ title: "DR_PROMPT", kind: "image", alpha: false }],
  models: [],
  maxPixels: 1024 ** 2,
  enabled: true,
  validationEvidenceId: "qa-1",
};
const info: ObjectInfo = {
  Text: { input: { required: { text: ["STRING"] } }, output: ["STRING"] },
};
const intent = intentSchema.parse({
  prompt: "Exactly TWO red bottles. Text: NOIR. No plants.",
  width: 512,
  height: 512,
  seed: 10,
  model: "Auto",
});
describe("semantic workflow contract", () => {
  it("preserves prompt intent and leaves source graph immutable", () => {
    const output = bind(graph, manifest, { prompt: intent.prompt });
    expect(output.arbitrary!.inputs.text).toBe(intent.prompt);
    expect(graph.arbitrary!.inputs.text).toBe("original");
  });
  it("rejects stale graph hashes", () =>
    expect(() =>
      bind({ ...graph, other: graph.arbitrary! }, manifest, { prompt: "x" }),
    ).toThrow("hash"));
  it("rejects duplicate semantic titles", () => {
    const g = { ...graph, duplicate: graph.arbitrary! };
    expect(() =>
      bind(g, { ...manifest, graphSha256: graphHash(g) }, { prompt: "x" }),
    ).toThrow("Expected one");
  });
  it("rejects missing node classes and invalid input types", () => {
    expect(() => preflight(graph, manifest, {})).toThrow("Missing node");
    expect(() => bind(graph, manifest, { prompt: 42 })).toThrow("Invalid");
  });
  it("checks model dropdown options before submitting", () => {
    expect(() =>
      preflight(graph, manifest, {
        Text: { input: { required: { text: [["other"]] } } },
      }),
    ).toThrow("Unavailable");
  });
  it("validates all semantic bindings", () =>
    expect(preflight(graph, manifest, info).ready).toBe(true));
});
describe("routing readiness", () => {
  it("requires current readiness plus visual evidence", () => {
    expect(() =>
      chooseRoute(
        intent,
        [{ ...manifest, validationEvidenceId: null }],
        new Set(["test"]),
      ),
    ).toThrow("No validated");
    expect(() => chooseRoute(intent, [manifest], new Set())).toThrow(
      "No validated",
    );
  });
  it("never silently ignores a model override", () =>
    expect(() =>
      chooseRoute({ ...intent, model: "Qwen" }, [manifest], new Set(["test"])),
    ).toThrow("No validated"));
  it("explains the selected scoped route", () =>
    expect(chooseRoute(intent, [manifest], new Set(["test"])).evidenceId).toBe(
      "qa-1",
    ));
  it("rejects invalid dimensions and blank briefs", () => {
    expect(() => intentSchema.parse({ ...intent, width: 513 })).toThrow();
    expect(() => intentSchema.parse({ ...intent, prompt: " " })).toThrow();
  });
});
it("accepts only loopback ComfyUI origins", () => {
  for (const url of [
    "https://localhost:8188",
    "http://example.com",
    "http://localhost/a",
    "http://user@localhost",
    "http://localhost?x=1",
  ])
    expect(() => loopbackUrl(url)).toThrow();
  expect(loopbackUrl("http://127.0.0.1:8188")).toBe("http://127.0.0.1:8188");
});
