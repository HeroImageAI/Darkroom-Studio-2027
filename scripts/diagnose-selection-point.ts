import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  selectionGraph,
  selectionNodeFingerprint,
  selectionModelHash,
} from "../apps/api/src/selection-workflow.js";
const root = "data/point-diagnostic";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
if (!inspection.status.verified) throw Error("Verified local Desktop required");
const cases = [
  {
    name: "badge-raw",
    path: "data/scope-qa/astronaut.png",
    point: { x: 171, y: 385 },
    refine: 0,
  },
  {
    name: "badge-refined",
    path: "data/scope-qa/astronaut.png",
    point: { x: 171, y: 385 },
    refine: 2,
  },
  {
    name: "sleeve",
    path: "data/scope-qa/astronaut.png",
    point: { x: 55, y: 385 },
    refine: 2,
  },
  {
    name: "bottle",
    path: "data/create-qa/reference-1.png",
    point: { x: 384, y: 400 },
    refine: 2,
  },
];
const reports: any[] = [];
for (const c of cases) {
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy");
  const bytes = readFileSync(c.path),
    image = await client.uploadReference(bytes),
    graph = selectionGraph(image, "");
  graph["3"]!.inputs.positive_coords = JSON.stringify([c.point]);
  graph["3"]!.inputs.refine_iterations = c.refine;
  const start = Date.now(),
    id = await client.submit(graph, randomUUID());
  writeFileSync(`${root}/${c.name}.graph.json`, JSON.stringify(graph, null, 2));
  console.log(c.name + " " + id);
  let completed = false;
  while (Date.now() - start < 120000) {
    const h = await client.history(id);
    if (h?.status?.status_str === "error" || h?.status?.completed) {
      completed = true;
      writeFileSync(
        `${root}/${c.name}.history.json`,
        JSON.stringify(h, null, 2),
      );
      const error = h.status.messages?.find(
        (m: any) => m[0] === "execution_error",
      )?.[1];
      const report: any = {
        ...c,
        promptId: id,
        ms: Date.now() - start,
        status: h.status.status_str,
        error: error?.exception_message,
        traceback: error?.traceback,
        sourceHash: createHash("sha256").update(bytes).digest("hex"),
        visualReview: "pending",
      };
      if (h.status.status_str !== "error") {
        const output = await client.image(h.outputs["99"].images[0]);
        writeFileSync(`${root}/${c.name}.mask.png`, output);
        const mask = await sharp(output)
          .removeAlpha()
          .greyscale()
          .threshold(128)
          .raw()
          .toBuffer();
        const raw = await sharp(bytes)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        if (mask.length !== raw.info.width * raw.info.height)
          throw Error("Mask dimensions changed");
        report.selectedPixels = mask.filter((v) => v > 0).length;
        for (let i = 0; i < mask.length; i++)
          if (mask[i]) {
            raw.data[i * 4] = Math.round(raw.data[i * 4]! * 0.65 + 255 * 0.35);
            raw.data[i * 4 + 1] = Math.round(raw.data[i * 4 + 1]! * 0.65);
            raw.data[i * 4 + 2] = Math.round(raw.data[i * 4 + 2]! * 0.65);
          }
        writeFileSync(
          `${root}/${c.name}.overlay.png`,
          await sharp(raw.data, { raw: raw.info }).png().toBuffer(),
        );
      }
      reports.push(report);
      writeFileSync(
        `${root}/report.json`,
        JSON.stringify(
          {
            enabled: false,
            engineVersion: inspection.status.version,
            nodeFingerprint: selectionNodeFingerprint(inspection.info),
            modelHash: await selectionModelHash(),
            cases: reports,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify(report));
      break;
    }
    await delay(300);
  }
  if (!completed)
    throw Error(
      "Point diagnostic timed out; inspect the engine queue before retrying",
    );
}
