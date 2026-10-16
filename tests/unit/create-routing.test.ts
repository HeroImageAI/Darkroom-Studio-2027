import { it, expect } from "vitest";
import { chooseRoute } from "../../packages/routing/src/policy.js";
import {
  dimensions,
  intentSchema,
} from "../../packages/contracts/src/index.js";
import { workflows } from "../../apps/api/src/workflow.js";
import { stableCapabilities } from "../../apps/api/src/comfy.js";
const manifests = workflows.map((w) => ({
  ...w.manifest,
  enabled: true,
  validationEvidenceId: "test-only",
}));
const ready = new Set(manifests.map((m) => m.id));
const intent = intentSchema.parse({
  prompt: "A cinematic photograph of one red sphere, no text, no logos.",
  width: 768,
  height: 768,
  seed: 2027,
});
it("uses Klein for ordinary Draft and Qwen for text and Final", () => {
  expect(chooseRoute(intent, manifests, ready).workflow.modelFamily).toBe(
    "Klein",
  );
  expect(
    chooseRoute({ ...intent, quality: "Final" }, manifests, ready).workflow
      .modelFamily,
  ).toBe("Qwen");
  expect(
    chooseRoute(
      { ...intent, prompt: 'A sign reading "NOIR"' },
      manifests,
      ready,
    ).workflow.modelFamily,
  ).toBe("Qwen");
});
it("matches exact reference count and preserves an explicit model override", () => {
  const refs = [
    "4e44818b-8527-45b7-a9f9-b3636615a365",
    "30fec6d2-02e5-4d02-a1f2-46876989706c",
  ];
  expect(
    chooseRoute({ ...intent, references: refs }, manifests, ready).workflow.id,
  ).toBe("create.qwen.2ref");
  expect(
    chooseRoute(
      { ...intent, references: refs, model: "Klein" },
      manifests,
      ready,
    ).workflow.id,
  ).toBe("create.klein.2ref");
});
it("does not enable missing routes or silently ignore unavailable overrides", () => {
  expect(() =>
    chooseRoute(
      { ...intent, model: "Qwen" },
      manifests,
      new Set(["create.klein.0ref"]),
    ),
  ).toThrow("No validated");
});
it("uses multiple-of-16 dimensions across all preset aspects", () => {
  for (const a of [
    "Square",
    "Portrait",
    "Landscape",
    "Vertical",
    "Wide",
  ] as const)
    for (const q of ["Draft", "Final"] as const) {
      const [w, h] = dimensions(a, q);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
      expect(w * h).toBeLessThanOrEqual(1572864);
    }
});
it("uses the tested three-reference Draft fallback and rejects the failed explicit route", () => {
  const refs = [
    "4e44818b-8527-45b7-a9f9-b3636615a365",
    "30fec6d2-02e5-4d02-a1f2-46876989706c",
    "34679efe-2041-4b98-98c5-879d30d66905",
  ];
  const scoped = manifests.map((m) => ({
    ...m,
    validatedQualities:
      m.id === "create.qwen.3ref"
        ? ["Final" as const]
        : ["Draft" as const, "Final" as const],
  }));
  expect(
    chooseRoute({ ...intent, references: refs }, scoped, ready).workflow
      .modelFamily,
  ).toBe("Klein");
  expect(() =>
    chooseRoute({ ...intent, references: refs, model: "Qwen" }, scoped, ready),
  ).toThrow("did not pass visual validation");
});
it("ignores transient upload dropdowns and unrelated node classes in capability evidence", () => {
  const a: any = {
    LoadImage: {
      input: { required: { image: [["old.png"], { image_upload: true }] } },
      output: ["IMAGE", "MASK"],
    },
    Unrelated: { input: { required: { image: [["output-a"]] } } },
  };
  const b = structuredClone(a);
  b.LoadImage.input.required.image[0] = ["new.png"];
  b.Unrelated.input.required.image[0] = ["output-b"];
  expect(stableCapabilities(a)).toEqual(stableCapabilities(b));
});
