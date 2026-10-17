import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { protectRequestedEdit } from "../apps/api/src/edit-render.js";
const root = "data/scope-qa",
  reports = JSON.parse(readFileSync(root + "/photo-runs.json", "utf8"));
for (const r of reports.filter((r: any) => r.task === "Recolour")) {
  const path = root + "/" + r.name;
  if (!existsSync(path + ".before-boundary-fix.png"))
    copyFileSync(path + ".result.png", path + ".before-boundary-fix.png");
  const result = await protectRequestedEdit(
    readFileSync(path + ".before.png"),
    readFileSync(path + ".allowed-mask.png"),
    readFileSync(path + ".raw.png"),
    r.task,
  );
  writeFileSync(path + ".result.png", result);
  r.outputHash = createHash("sha256").update(result).digest("hex");
  r.compositor = "No old-colour matching or inward fade for Recolour";
}
writeFileSync(root + "/photo-runs.json", JSON.stringify(reports, null, 2));
