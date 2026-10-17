import { it, expect } from "vitest";
import {
  selectionGraph,
  selectionSignature,
  selectionNodeFingerprint,
  assertSelectionReady,
} from "../../apps/api/src/selection-workflow.js";
it("uses the validated SAM description path without the unreliable point decoder", () => {
  const graph = selectionGraph("test.png", "orange spacesuit");
  expect(graph["3"]!.inputs).toMatchObject({
    conditioning: ["5", 0],
    individual_masks: false,
    refine_iterations: 0,
  });
  expect(graph["3"]!.inputs.positive_coords).toBeUndefined();
  expect(graph["5"]!.inputs.text).toBe("orange spacesuit");
  expect(selectionSignature()).toMatch(/^[a-f0-9]{64}$/);
});
it("refuses unvalidated selection schemas without contacting the model file", async () => {
  await expect(assertSelectionReady({}, "changed")).rejects.toThrow(
    "validation",
  );
  expect(selectionNodeFingerprint({})).toMatch(/^[a-f0-9]{64}$/);
});
