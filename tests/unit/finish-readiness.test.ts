import { it, expect } from "vitest";
import { finishGraph } from "../../apps/api/src/finish-workflows.js";
import {
  finishEvidence,
  finishSignature,
  assertFinishReady,
  finishNodeFingerprint,
} from "../../apps/api/src/finish-readiness.js";
import { graphHash } from "../../packages/workflows/src/bind.js";
it("pins enabled finishing templates and the actual alpha processing implementation", () => {
  const e = finishEvidence();
  expect(e.implementationHash).toBe(finishSignature());
  for (const task of e.enabledTasks)
    expect(e.templateHashes[task]).toBe(
      graphHash(finishGraph(task, "__INPUT__")),
    );
  expect(e.enabledTasks).not.toContain("Restore");
});
it("refuses an unvalidated Restore and a changed engine schema or version", async () => {
  await expect(assertFinishReady("Restore", {}, "0.41.2")).rejects.toThrow(
    "validation",
  );
  await expect(assertFinishReady("Upscale", {}, "0.41.2")).rejects.toThrow(
    "validation",
  );
  await expect(
    assertFinishReady("Remove background", {}, "changed-version"),
  ).rejects.toThrow("validation");
});
it("ignores changing upload choices while retaining model and socket schema changes", () => {
  const info: any = {
    LoadImage: { input: { required: { image: [["a.png"]] } } },
  };
  const before = finishNodeFingerprint(info);
  info.LoadImage.input.required.image[0] = ["b.png"];
  expect(finishNodeFingerprint(info)).toBe(before);
  info.LoadImage.output = ["CHANGED"];
  expect(finishNodeFingerprint(info)).not.toBe(before);
});
