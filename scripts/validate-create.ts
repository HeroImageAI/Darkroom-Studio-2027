import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { workflows } from "../apps/api/src/workflow.js";
import { bind, preflight, graphHash } from "../packages/workflows/src/bind.js";
const root = "data/create-qa";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance);
const inspection = await client.inspect();
if (!inspection.status.verified) throw Error("Verified Desktop required");
const bottle = `<svg width="768" height="768" xmlns="http://www.w3.org/2000/svg"><rect width="768" height="768" fill="#d4d0c8"/><ellipse cx="384" cy="675" rx="155" ry="24" fill="#aaa69e"/><rect x="286" y="170" width="196" height="495" rx="50" fill="#242424"/><rect x="313" y="100" width="142" height="110" rx="8" fill="#111"/><rect x="306" y="340" width="156" height="180" rx="2" fill="#f5efe1"/><text x="384" y="426" text-anchor="middle" font-size="42" font-family="Arial" fill="#111">NOIR</text><text x="384" y="460" text-anchor="middle" font-size="14" font-family="Arial" fill="#333">EAU DE PARFUM</text></svg>`;
const refs = [
  await sharp(Buffer.from(bottle)).png().toBuffer(),
  await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#15263b"/><stop offset="1" stop-color="#030812"/></linearGradient></defs><rect width="768" height="768" fill="url(#g)"/></svg>',
    ),
  )
    .png()
    .toBuffer(),
  await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><rect width="768" height="768" fill="#111"/><rect x="55" y="60" width="90" height="640" fill="#fafafa"/></svg>',
    ),
  )
    .png()
    .toBuffer(),
];
for (let i = 0; i < refs.length; i++)
  writeFileSync(root + "/reference-" + (i + 1) + ".png", refs[i]!);
const names = [];
for (const bytes of refs) names.push(await client.uploadReference(bytes));
const reports: any[] = existsSync(root + "/runs.json")
  ? JSON.parse(readFileSync(root + "/runs.json", "utf8"))
  : [];
const filter = process.env.DR_QA_FILTER;
for (const w of workflows)
  for (const quality of ["Draft", "Final"] as const) {
    const key = w.manifest.id + "." + quality;
    if (filter && !key.includes(filter)) continue;
    if (
      reports.some(
        (r) =>
          r.key === key &&
          r.workflowHash === w.manifest.graphSha256 &&
          r.engineFingerprint === inspection.status.fingerprint,
      )
    )
      continue;
    const q = await client.queue();
    if (q.queue_running.length || q.queue_pending.length)
      throw Error(
        "Engine busy; rerun to resume without duplicate completed cases",
      );
    const count = w.manifest.referenceCount ?? 0;
    const [width, height] =
      quality === "Draft"
        ? [768, 768]
        : count === 0
          ? [1216, 832]
          : count === 1
            ? [832, 1216]
            : count === 2
              ? [768, 1344]
              : [1344, 768];
    const prompt =
      count === 0
        ? 'A cream paper card standing upright on a dark charcoal stone block. The card has exactly the word "NOIR" printed in large black capital letters. One card only, studio photograph, black background, no other text.'
        : `Create a professional studio photograph of the exact bottle in image 1. Preserve its black cylindrical body, black cap, cream rectangular label, the exact word NOIR, and the small text EAU DE PARFUM. One bottle only. ${count >= 2 ? "Use the navy blue colour from image 2 for the background." : "Use a dark charcoal background."} ${count >= 3 ? "Use image 3 only as a left-side lighting guide." : ""} Keep the complete bottle visible. Do not redesign the product.`;
    const values: Record<string, string | number> = {
      prompt,
      width,
      height,
      seed: 2027,
      steps: w.manifest.qualitySteps![quality],
    };
    for (let i = 1; i <= count; i++) values["reference" + i] = names[i - 1]!;
    preflight(w.graph, w.manifest, inspection.info);
    const compiled = bind(w.graph, w.manifest, values);
    const info = await client.json("/object_info");
    preflight(
      compiled,
      { ...w.manifest, graphSha256: graphHash(compiled) },
      info,
      new Set(names),
    );
    const start = Date.now();
    const id = await client.submit(compiled, randomUUID());
    console.log("Rendering " + key + " " + id);
    let peak = 0;
    let completed = false;
    while (Date.now() - start < 600000) {
      const history = await client.history(id);
      const stats = await client.json("/system_stats");
      const d = stats.devices?.[0];
      if (d) peak = Math.max(peak, d.vram_total - d.vram_free);
      if (history?.status?.status_str === "error")
        throw Error(JSON.stringify(history.status));
      if (history?.status?.completed) {
        const image = history.outputs?.output?.images?.[0];
        if (!image) throw Error("Missing output");
        const bytes = await client.image(image);
        const metadata = await sharp(bytes).metadata();
        if (metadata.width !== width || metadata.height !== height)
          throw Error("Wrong dimensions");
        writeFileSync(root + "/" + key + ".png", bytes);
        const report = {
          key,
          workflow: w.manifest.id,
          quality,
          width,
          height,
          prompt,
          seed: 2027,
          promptId: id,
          workflowHash: w.manifest.graphSha256,
          engineFingerprint: inspection.status.fingerprint,
          engineVersion: inspection.status.version,
          modelFiles: inspection.status.modelFiles,
          elapsedMs: Date.now() - start,
          peakWholeGpuUsedBytes: peak,
          outputHash: createHash("sha256").update(bytes).digest("hex"),
          referenceHashes: refs
            .slice(0, count)
            .map((b) => createHash("sha256").update(b).digest("hex")),
          visualAssessment: "PENDING",
        };
        reports.push(report);
        writeFileSync(root + "/runs.json", JSON.stringify(reports, null, 2));
        console.log("Completed " + key + " " + report.elapsedMs + " ms");
        completed = true;
        break;
      }
      await delay(1000);
    }
    if (!completed) throw Error("Timeout; inspect engine before resuming");
  }
console.log("Saved " + reports.length + " real render cases in " + root);
