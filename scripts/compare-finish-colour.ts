// Compare installed postprocessing choices; never updates enabled evidence.
import assert from "node:assert/strict";
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
import {
  finishModelHashes,
  finishNodeFingerprint,
  finishEvidence,
} from "../apps/api/src/finish-readiness.js";
import { graphHash } from "../packages/workflows/src/bind.js";
const root = "data/quality-gaps/finish-colour";
mkdirSync(root, { recursive: true });
const client = new ComfyClient(config.comfyUrl, config.instance),
  stats = await client.json("/system_stats"),
  info = await client.json("/object_info");
if (
  !config.instance ||
  !(stats.system?.argv ?? []).some(
    (s: string) =>
      s.includes("instance-model-paths") &&
      s.includes(config.instance + ".yaml"),
  )
)
  throw Error("Verified Desktop required");
const models = await finishModelHashes();
assert.deepEqual(models, finishEvidence().modelHashes);
assert.equal(finishNodeFingerprint(info), finishEvidence().nodeFingerprint);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const runs: object[] = [];
for (const fixture of ["graphic", "portrait"])
  for (const task of ["Upscale", "Restore"] as const) {
    const source = readFileSync(
      "data/quality-gaps/finish-alpha" +
        (fixture === "portrait" ? "/portrait" : "") +
        "/source.png",
    );
    const size = task === "Upscale" ? 512 : 256,
      { engine, resized } = await finishInput(source, task, size, size);
    const uploaded = await client.uploadReference(engine);
    const original = await sharp(resized).ensureAlpha().raw().toBuffer();
    const originalBlur = await sharp(resized)
      .removeAlpha()
      .blur(5)
      .raw()
      .toBuffer();
    const preserve =
      fixture === "portrait"
        ? [
            { x: 80, y: 20 },
            { x: 145, y: 20 },
            { x: 145, y: 95 },
            { x: 80, y: 95 },
          ]
        : [
            { x: 104, y: 112 },
            { x: 152, y: 112 },
            { x: 152, y: 144 },
            { x: 104, y: 144 },
          ];
    for (const method of ["lab", "wavelet", "adain", "none"]) {
      const queue = await client.queue();
      if (queue.queue_running.length || queue.queue_pending.length)
        throw Error("Engine busy; do not interrupt other work");
      const graph = finishGraph(task, uploaded);
      graph["9"]!.inputs.color_correction_method = method;
      preflightFinish(graph, info, uploaded);
      const start = Date.now(),
        promptId = await client.submit(graph, randomUUID());
      console.log(JSON.stringify({ fixture, task, method, promptId }));
      let raw: Buffer | undefined;
      while (Date.now() - start < 300000) {
        const h = await client.history(promptId);
        if (h?.status?.status_str === "error")
          throw Error("Colour comparison failed");
        if (h?.status?.completed) {
          raw = await client.image(h.outputs["99"].images[0]);
          break;
        }
        await delay(500);
      }
      if (!raw) throw Error("Colour comparison timed out");
      const result = await finishOutput(
        source,
        raw,
        task,
        size,
        size,
        task === "Restore" ? preserve : undefined,
      );
      const pixels = await sharp(result).ensureAlpha().raw().toBuffer();
      const blurred = await sharp(result)
        .removeAlpha()
        .blur(5)
        .raw()
        .toBuffer();
      let translucent = 0,
        tn = 0,
        opaque = 0,
        on = 0,
        lowFrequency = 0;
      for (let i = 0; i < size * size; i++) {
        const a = original[i * 4 + 3]!;
        assert.equal(pixels[i * 4 + 3], a);
        for (let c = 0; c < 3; c++) {
          const error = Math.abs(pixels[i * 4 + c]! - original[i * 4 + c]!);
          if (a >= 64 && a < 255) {
            translucent += error;
            tn++;
          }
          if (a === 255) {
            opaque += error;
            lowFrequency += Math.abs(
              blurred[i * 3 + c]! - originalBlur[i * 3 + c]!,
            );
            on++;
          }
        }
        const x = i % size,
          y = Math.floor(i / size);
        if (
          task === "Restore" &&
          x >= preserve[0]!.x &&
          x < preserve[2]!.x &&
          y >= preserve[0]!.y &&
          y < preserve[2]!.y
        )
          assert.ok(
            original
              .subarray(i * 4, i * 4 + 4)
              .equals(pixels.subarray(i * 4, i * 4 + 4)),
          );
      }
      const name = `${fixture}-${task}-${method}`;
      writeFileSync(`${root}/${name}.raw.png`, raw);
      writeFileSync(`${root}/${name}.result.png`, result);
      runs.push({
        fixture,
        task,
        method,
        promptId,
        ms: Date.now() - start,
        sourceHash: hash(source),
        rawHash: hash(raw),
        outputHash: hash(result),
        executionHash: graphHash(graph),
        alphaExact: true,
        translucentRgbMae: translucent / tn,
        opaqueRgbMae: opaque / on,
        opaqueLowFrequencyRgbMae: lowFrequency / on,
        visualReview: "pending",
      });
      writeFileSync(
        `${root}/runs.json`,
        JSON.stringify(
          {
            engineVersion: stats.system.comfyui_version,
            modelHashes: models,
            nodeFingerprint: finishNodeFingerprint(info),
            scope:
              "Matched source, seed, size and graph; only installed postprocessing method varies. Source RGB metrics do not measure recovered detail.",
            runs,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(JSON.stringify(runs.at(-1)));
    }
  }
