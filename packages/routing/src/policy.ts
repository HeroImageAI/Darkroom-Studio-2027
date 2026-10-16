import type { Intent } from "../../contracts/src/index.js";
import type { Manifest } from "../../workflows/src/manifest.js";
export function chooseRoute(
  intent: Intent,
  manifests: Manifest[],
  readyIds: Set<string>,
) {
  const eligible = manifests.filter(
    (m) =>
      m.enabled &&
      m.validationEvidenceId &&
      readyIds.has(m.id) &&
      intent.width * intent.height <= m.maxPixels &&
      (intent.model === "Auto" || m.modelFamily === intent.model),
  );
  if (!eligible.length)
    throw Error(
      "No validated workflow is ready for this request. Check local setup.",
    );
  // Foundation has one scoped route. Ranking multiple model families awaits Phase 2 outcome benchmarks.
  const workflow = eligible[0]!;
  return {
    workflow,
    reason: "Single validated foundation generation route",
    evidenceId: workflow.validationEvidenceId,
    policyVersion: 1,
  };
}
