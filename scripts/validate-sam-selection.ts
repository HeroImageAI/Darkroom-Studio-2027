import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  selectionGraph,
  selectionModelHash,
  selectionNodeFingerprint,
  selectionSignature,
} from "../apps/api/src/selection-workflow.js";
const root = "data/scope-qa";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  stats = await client.json("/system_stats"),
  inspection = {
    status: {
      verified:
        !!config.instance &&
        (stats.system?.argv ?? []).some(
          (s: string) =>
            s.includes("instance-model-paths") &&
            s.includes(config.instance + ".yaml"),
        ),
      version: stats.system?.comfyui_version,
    },
    info: await client.json("/object_info"),
  };
if (!inspection.status.verified) throw Error("Verified Desktop required");
const reports: any[] = [];
for (const [name, path, point, description] of [
  ["sam-portrait", root + "/astronaut.png", undefined, "person"],
  ["sam-product", "data/create-qa/reference-1.png", undefined, "bottle"],
  ["sam-garment", root + "/astronaut.png", undefined, "orange spacesuit"],
  ["sam-sleeve", root + "/astronaut.png", { x: 55, y: 385 }, "left sleeve"],
] as const) {
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy");
  const bytes = readFileSync(path),
    image = await client.uploadReference(bytes),
    graph = selectionGraph(image, description!),
    start = Date.now(),
    id = await client.submit(graph, randomUUID());
  console.log("SAM case " + name + " " + id);
  let output: Buffer | undefined;
  while (Date.now() - start < 180000) {
    const h = await client.history(id);
    if (h?.status?.status_str === "error") {
      writeFileSync(root + "/sam-error.json", JSON.stringify(h, null, 2));
      throw Error("SAM engine failed");
    }
    if (h?.status?.completed) {
      output = await client.image(h.outputs["99"].images[0]);
      break;
    }
    await delay(500);
  }
  if (!output) throw Error("SAM timed out");
  const source = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    mask = await sharp(output)
      .removeAlpha()
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer();
  if (mask.length !== source.info.width * source.info.height)
    throw Error("Mask dimensions changed");
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      source.data[i * 4] = Math.round(source.data[i * 4]! * 0.65 + 255 * 0.35);
      source.data[i * 4 + 1] = Math.round(source.data[i * 4 + 1]! * 0.65);
      source.data[i * 4 + 2] = Math.round(source.data[i * 4 + 2]! * 0.65);
    }
  writeFileSync(root + "/" + name + ".mask.png", output);
  writeFileSync(
    root + "/" + name + ".selection.png",
    await sharp(source.data, { raw: source.info }).png().toBuffer(),
  );
  const report = {
    name,
    point,
    description,
    ms: Date.now() - start,
    promptId: id,
    selectedPixels: mask.filter((v) => v > 0).length,
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    visualReview: "pending",
  };
  reports.push(report);
  writeFileSync(root + "/sam-runs.json", JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(report));
}
writeFileSync(
  "workflows/selection-validation.json",
  JSON.stringify(
    {
      enabled: false,
      engineVersion: inspection.status.version,
      nodeFingerprint: selectionNodeFingerprint(inspection.info),
      modelHash: await selectionModelHash(),
      implementationHash: selectionSignature(),
      cases: reports,
      scope:
        "Point/object, garment description and sleeve refinement scoped checks; visual review pending",
    },
    null,
    2,
  ) + "\n",
);
