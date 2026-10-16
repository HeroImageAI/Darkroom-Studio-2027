// Opt-in owned-fixture QA. Never enables a route or changes a master.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
} from "../apps/api/src/finish-workflows.js";
import { finishSignature } from "../apps/api/src/finish-readiness.js";
const root = "data/restore-qa";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  inspection = await client.inspect();
if (!inspection.status.verified) throw Error("Verified Desktop required");
const reports: any[] = [];
for (const [size, degraded] of [
  [384, false],
  [768, false],
  [384, true],
] as const) {
  let source = await sharp(readFileSync("data/create-qa/reference-1.png"))
    .resize(size, size)
    .png()
    .toBuffer();
  if (degraded)
    source = await sharp(
      await sharp(source).blur(0.45).jpeg({ quality: 65 }).toBuffer(),
    )
      .png()
      .toBuffer();
  const scale = size / 384,
    preserve = [
      { x: 146 * scale, y: 164 * scale },
      { x: 238 * scale, y: 164 * scale },
      { x: 238 * scale, y: 267 * scale },
      { x: 146 * scale, y: 267 * scale },
    ];
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length)
    throw Error("Engine busy");
  const { engine } = await finishInput(source, "Restore", size, size),
    image = await client.uploadReference(engine),
    graph = finishGraph("Restore", image);
  preflightFinish(graph, await client.json("/object_info"), image);
  const start = Date.now(),
    id = await client.submit(graph, randomUUID());
  let complete = false;
  while (Date.now() - start < 600000) {
    const h = await client.history(id);
    if (h?.status?.status_str === "error") throw Error("Engine failed");
    if (h?.status?.completed) {
      const raw = await client.image(h.outputs["99"].images[0]),
        result = await finishOutput(
          source,
          raw,
          "Restore",
          size,
          size,
          preserve,
        );
      const before = await sharp(source).ensureAlpha().raw().toBuffer(),
        after = await sharp(result).ensureAlpha().raw().toBuffer();
      let protectedPixels = 0,
        changedOutside = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const inside =
            x >= 146 * scale &&
            x < 238 * scale &&
            y >= 164 * scale &&
            y < 267 * scale;
          if (before[i + 3] !== after[i + 3]) throw Error("Alpha changed");
          if (inside) {
            protectedPixels++;
            if (!before.subarray(i, i + 4).equals(after.subarray(i, i + 4)))
              throw Error("Protected label changed");
          } else if (
            !before.subarray(i, i + 3).equals(after.subarray(i, i + 3))
          )
            changedOutside++;
        }
      if (!changedOutside)
        throw Error("Restoration did not change any allowed pixels");
      const name = `${size}-${degraded ? "degraded" : "clean"}`;
      writeFileSync(`${root}/${name}.before.png`, source);
      writeFileSync(`${root}/${name}.raw.png`, raw);
      writeFileSync(`${root}/${name}.result.png`, result);
      const r = {
        name,
        task: "Restore",
        size,
        workingSize: size * 2,
        promptId: id,
        ms: Date.now() - start,
        sourceHash: createHash("sha256").update(source).digest("hex"),
        resultHash: createHash("sha256").update(result).digest("hex"),
        preserve,
        protectedPixels,
        protectedRGBA: "exact",
        alpha: "exact",
        changedOutside,
        implementationHash: finishSignature(),
        engineFingerprint: inspection.status.fingerprint,
        visualReview: "pending",
      };
      reports.push(r);
      console.log(JSON.stringify(r));
      complete = true;
      break;
    }
    await delay(1000);
  }
  if (!complete) throw Error("Deadline exceeded; inspect engine before retry");
}
writeFileSync(root + "/runs.json", JSON.stringify(reports, null, 2));
