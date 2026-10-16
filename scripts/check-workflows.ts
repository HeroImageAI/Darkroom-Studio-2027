import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflows } from "../apps/api/src/workflow.js";
import { readiness } from "../apps/api/src/readiness.js";
import { preflight } from "../packages/workflows/src/bind.js";
const inspection = await new ComfyClient(
  config.comfyUrl,
  config.instance,
).inspect();
if (!inspection.status.verified)
  throw Error(inspection.status.reason ?? "Desktop not verified");
const validation = workflows.map((w) => ({
  id: w.manifest.id,
  ...preflight(w.graph, w.manifest, inspection.info),
}));
console.log(
  JSON.stringify(
    {
      engine: inspection.status,
      validation,
      routes: readiness(inspection.status, inspection.info),
    },
    null,
    2,
  ),
);
