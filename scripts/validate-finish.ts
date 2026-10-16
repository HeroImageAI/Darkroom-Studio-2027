// Opt-in GPU validation of owned fixtures. Does not enable any route or accept a result.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  finishGraph,
  finishInput,
  finishOutput,
  preflightFinish,
  type FinishTask,
} from "../apps/api/src/finish-workflows.js";
import { graphHash } from "../packages/workflows/src/bind.js";
const root = "data/finish-qa";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
if (!inspection.status.verified) throw Error("Verified Desktop required");
const reports: any[] = existsSync(root + "/runs.json")
  ? JSON.parse(readFileSync(root + "/runs.json", "utf8"))
  : [];
for (const task of [
  "Remove background",
  "Restore",
  "Upscale",
] as FinishTask[]) {
  if (process.env.DR_FINISH_QA_TASK && task !== process.env.DR_FINISH_QA_TASK)
    continue;
  const base = Number(process.env.DR_FINISH_QA_SIZE ?? 384),
    scale = Number(process.env.DR_FINISH_QA_SCALE ?? 2);
  const name =
    task.replaceAll(" ", "-") + `-${base}-${task === "Upscale" ? scale : 1}x`;
  const source = await sharp(readFileSync("data/create-qa/reference-1.png"))
    .resize(base, base)
    .png()
    .toBuffer();
  const width = task === "Upscale" ? base * scale : base,
    height = width;
  const queue = await client.queue();
  if (queue.queue_running.length || queue.queue_pending.length)
    throw Error("Engine busy; do not disturb other work");
  const { engine } = await finishInput(source, task, width, height),
    image = await client.uploadReference(engine),
    graph = finishGraph(task, image);
  preflightFinish(graph, await client.json("/object_info"), image);
  const start = Date.now(),
    promptId = await client.submit(graph, randomUUID());
  console.log(JSON.stringify({ task, promptId, state: "submitted" }));
  let completed = false;
  while (Date.now() - start < 600000) {
    const h = await client.history(promptId);
    if (h?.status?.status_str === "error") {
      writeFileSync(
        root + "/" + name + ".error.json",
        JSON.stringify(h, null, 2),
      );
      throw Error("Engine failed: " + task);
    }
    if (h?.status?.completed) {
      const raw = await client.image(h.outputs["99"].images[0]),
        result = await finishOutput(source, raw, task, width, height);
      writeFileSync(root + "/" + name + ".before.png", source);
      writeFileSync(root + "/" + name + ".raw.png", raw);
      writeFileSync(root + "/" + name + ".result.png", result);
      const report = {
        task,
        promptId,
        width,
        height,
        ms: Date.now() - start,
        engineFingerprint: inspection.status.fingerprint,
        templateHash: graphHash(finishGraph(task, "__INPUT__")),
        resultHash: createHash("sha256").update(result).digest("hex"),
        visualReview: "pending",
      };
      reports.push(report);
      writeFileSync(root + "/runs.json", JSON.stringify(reports, null, 2));
      console.log(JSON.stringify(report));
      completed = true;
      break;
    }
    await delay(1000);
  }
  if (!completed) throw Error("Deadline exceeded; inspect engine before retry");
}
