import type { EngineStatus } from "../../../packages/contracts/src/index.js";
import type { ObjectInfo } from "../../../packages/workflows/src/manifest.js";
import { preflight } from "../../../packages/workflows/src/bind.js";
import { workflows } from "./workflow.js";
export function readiness(status: EngineStatus, info: ObjectInfo) {
  return workflows.map((w) => {
    let reason = "Local Desktop connection required";
    let ready = false;
    try {
      if (!status.verified) throw Error(reason);
      preflight(w.graph, w.manifest, info);
      for (const m of w.manifest.models) {
        if (
          !m.sha256 ||
          status.modelFiles?.find((f) => f.filename === m.filename)?.sha256 !==
            m.sha256
        )
          throw Error("Model content verification required");
      }
      if (
        !w.manifest.enabled ||
        !w.manifest.validationEvidenceId ||
        w.manifest.validationFingerprint !== status.fingerprint
      )
        throw Error("Current visual validation required");
      ready = true;
      reason = "Ready";
    } catch (e) {
      reason = (e as Error).message;
    }
    return {
      id: w.manifest.id,
      model: w.manifest.modelFamily,
      references: w.manifest.referenceCount ?? 0,
      qualities: w.manifest.validatedQualities ?? [],
      ready,
      reason,
    };
  });
}
