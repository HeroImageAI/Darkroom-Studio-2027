// Re-evaluate saved raw model output after compositor changes; no GPU execution.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { protectEdit } from "../apps/api/src/edit-render.js";
import { editSignature } from "../packages/routing/src/edit-policy.js";
import { editTasks } from "../packages/contracts/src/edit.js";
const root = "data/edit-qa",
  reports = JSON.parse(readFileSync(root + "/runs.json", "utf8"));
for (const task of editTasks) {
  const record = [...reports]
    .reverse()
    .find((r) => r.task === task && r.templateVersion === 2);
  if (!record) throw Error("Missing current raw case: " + task);
  const source = readFileSync(`${root}/${task}.before.png`),
    mask = readFileSync(`${root}/${task}.mask.png`),
    raw = readFileSync(`${root}/${task}.raw.png`);
  const path = `${root}/${task}.result.png`;
  if (!existsSync(`${root}/${task}.before-final-composite.png`))
    copyFileSync(path, `${root}/${task}.before-final-composite.png`);
  const start = Date.now(),
    result = await protectEdit(
      source,
      mask,
      raw,
      task !== "Background",
      task !== "Expand",
    );
  writeFileSync(path, result);
  const a = await sharp(source).ensureAlpha().raw().toBuffer(),
    b = await sharp(result).ensureAlpha().raw().toBuffer(),
    m = await sharp(mask).greyscale().raw().toBuffer();
  for (let i = 0; i < m.length; i++)
    if (
      m[i] === 0 &&
      !a.subarray(i * 4, i * 4 + 4).equals(b.subarray(i * 4, i * 4 + 4))
    )
      throw Error("Protected pixels changed in " + task);
  Object.assign(record, {
    compositorVersion: 2,
    implementationSha256: editSignature(),
    recompositeMs: Date.now() - start,
    protectedPixelsExact: true,
    outputHash: createHash("sha256").update(result).digest("hex"),
    visualAssessment: "PENDING final visual review",
  });
  console.log(
    task +
      " protected pixels exact; recomposited in " +
      (Date.now() - start) +
      "ms",
  );
}
writeFileSync(root + "/runs.json", JSON.stringify(reports, null, 2));
