import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import { selectionGraph } from "../apps/api/src/selection-workflow.js";

// Comparison only: never changes the enabled workflow or its validation gate.
const root = "data/quality-gaps";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance);
const stats = await client.json("/system_stats");
if (
  !config.instance ||
  !(stats.system?.argv ?? []).some(
    (s: string) =>
      s.includes("instance-model-paths") &&
      s.includes(config.instance + ".yaml"),
  )
)
  throw Error("Verified Desktop required");
const reports: object[] = [];
for (const [name, path, description] of [
  ["garment", "data/scope-qa/astronaut.png", "orange spacesuit"],
  ["person", "data/scope-qa/astronaut.png", "person"],
  ["product", "data/create-qa/reference-1.png", "bottle"],
] as const) {
  const bytes = readFileSync(path);
  const source = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let baseline: Buffer | undefined;
  for (const iterations of [0, 1, 2]) {
    const queue = await client.queue();
    if (queue.queue_running.length || queue.queue_pending.length)
      throw Error("Engine busy");
    const graph = selectionGraph(
      await client.uploadReference(bytes),
      description,
    );
    graph["3"]!.inputs.refine_iterations = iterations;
    const started = Date.now(),
      id = await client.submit(graph, randomUUID());
    let output: Buffer | undefined;
    while (Date.now() - started < 180000) {
      const history = await client.history(id);
      if (history?.status?.status_str === "error")
        throw Error("Refinement failed: " + id);
      if (history?.status?.completed) {
        output = await client.image(history.outputs["99"].images[0]);
        break;
      }
      await delay(500);
    }
    if (!output) throw Error("Refinement timed out: " + id);
    const mask = await sharp(output)
      .removeAlpha()
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer();
    if (mask.length !== source.info.width * source.info.height)
      throw Error("Dimensions changed");
    baseline ??= mask;
    let added = 0,
      removed = 0,
      selected = 0;
    const overlay = Buffer.from(source.data);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) selected++;
      if (mask[i] && !baseline[i]) added++;
      if (!mask[i] && baseline[i]) removed++;
      if (mask[i] !== baseline[i]) {
        overlay[i * 4] = mask[i] ? 0 : 255;
        overlay[i * 4 + 1] = mask[i] ? 255 : 0;
        overlay[i * 4 + 2] = 255;
      }
    }
    writeFileSync(`${root}/${name}-${iterations}.mask.png`, output);
    writeFileSync(
      `${root}/${name}-${iterations}.changes.png`,
      await sharp(overlay, { raw: source.info }).png().toBuffer(),
    );
    reports.push({
      name,
      description,
      iterations,
      selected,
      added,
      removed,
      promptId: id,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      elapsedMs: Date.now() - started,
      visualReview: "pending",
    });
    writeFileSync(
      `${root}/selection-refinement.json`,
      JSON.stringify(reports, null, 2) + "\n",
    );
    console.log(JSON.stringify(reports.at(-1)));
  }
}
