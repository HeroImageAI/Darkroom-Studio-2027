import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { editWorkflowId, editModel } from "./edit-template.js";
import { canvasSignature } from "../../../apps/api/src/render-signature.js";
const loadedEditSignature = createHash("sha256")
  .update(readFileSync(resolve("packages/routing/src/edit-template.ts")))
  .update(readFileSync(resolve("apps/api/src/edit-render.ts")))
  .update(canvasSignature())
  .update(readFileSync(resolve("apps/api/src/worker.ts")))
  .update(readFileSync(resolve("apps/api/src/edits.ts")))
  .digest("hex");
export const editSignature = () => loadedEditSignature;
export function editEvidence() {
  return JSON.parse(
    readFileSync(resolve("workflows/edit-validation.json"), "utf8"),
  ) as {
    templateVersion: number;
    fingerprint: string | null;
    evidenceId: string | null;
    tasks: string[];
    implementationSha256?: string;
    graphHashes?: Record<string, string>;
  };
}
export function assertEditReady(task: string, fingerprint?: string) {
  const evidence = editEvidence();
  const workflowId = editWorkflowId(task);
  const manifest = JSON.parse(
    readFileSync(resolve("workflows/manifests", workflowId + ".json"), "utf8"),
  );
  if (
    !evidence.evidenceId ||
    evidence.fingerprint !== fingerprint ||
    !evidence.tasks.includes(task) ||
    evidence.templateVersion !== 2 ||
    evidence.implementationSha256 !== editSignature() ||
    evidence.graphHashes?.[workflowId] !== manifest.graphSha256
  )
    throw Error(
      `${task} has not passed visual edit validation for this engine. Your master is unchanged.`,
    );
  return {
    workflowId,
    quality: "Final",
    evidenceId: evidence.evidenceId,
    templateVersion: evidence.templateVersion,
    reason: workflowId.endsWith("1ref")
      ? "Validated Qwen background/expansion instruction route; exact compositing protects original pixels."
      : `Validated ${editModel(task)} instruction route with a second reference showing the allowed edit region; exact compositing protects pixels outside it.`,
  };
}
