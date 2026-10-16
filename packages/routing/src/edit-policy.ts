import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function editEvidence() {
  return JSON.parse(
    readFileSync(resolve("workflows/edit-validation.json"), "utf8"),
  ) as {
    templateVersion: number;
    fingerprint: string | null;
    evidenceId: string | null;
    tasks: string[];
  };
}
export function assertEditReady(task: string, fingerprint?: string) {
  const evidence = editEvidence();
  if (
    !evidence.evidenceId ||
    evidence.fingerprint !== fingerprint ||
    !evidence.tasks.includes(task)
  )
    throw Error(
      `${task} has not passed visual edit validation for this engine. Your master is unchanged.`,
    );
  return {
    workflowId: "create.qwen.2ref",
    quality: "Final",
    evidenceId: evidence.evidenceId,
    templateVersion: evidence.templateVersion,
    reason:
      "Validated Qwen instruction route with a second reference showing the allowed edit region; exact compositing protects pixels outside it.",
  };
}
