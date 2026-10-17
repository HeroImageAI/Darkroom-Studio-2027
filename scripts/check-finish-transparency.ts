// Opt-in local GPU check. Never enables a route or accepts a user's candidate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
import {
  finishInput,
  finishGraph,
  finishOutput,
  preflightFinish,
} from "../apps/api/src/finish-workflows.js";
import {
  finishSignature,
  finishEvidence,
  finishModelHashes,
  finishNodeFingerprint,
} from "../apps/api/src/finish-readiness.js";

const portrait = process.argv.includes("--portrait");
const root = "data/quality-gaps/finish-alpha" + (portrait ? "/portrait" : ""),
  baseline = "apps/api/src/.finish-alpha-baseline.ts";
mkdirSync(root, { recursive: true });
writeFileSync(
  baseline,
  execFileSync("git", [
    "show",
    "a00022f438238422ca379444c74b55ebb57cbd98:apps/api/src/finish-workflows.ts",
  ]),
);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
try {
  const old = await import(
    new URL("../apps/api/src/.finish-alpha-baseline.ts", import.meta.url).href
  );
  const client = new ComfyClient(config.comfyUrl, config.instance),
    inspection = await client.inspect();
  if (!inspection.status.verified) throw Error("Verified Desktop required");
  const evidence = finishEvidence();
  const modelHashes = await finishModelHashes();
  assert.deepEqual(
    modelHashes,
    evidence.modelHashes,
    "Finish model content changed",
  );
  assert.equal(
    finishNodeFingerprint(inspection.info),
    evidence.nodeFingerprint,
  );
  assert.equal(inspection.status.version, evidence.engineVersion);
  const source = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><radialGradient id="r"><stop offset="0.85" stop-color="#e40024"/><stop offset="1" stop-color="#e40024" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="110" fill="url(#r)"/><rect x="48" y="88" width="64" height="80" fill="#00cc88" fill-opacity="0.5"/><rect x="144" y="88" width="64" height="80" fill="#ffe080" fill-opacity="0.75"/><rect x="104" y="112" width="48" height="32" fill="white"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  // Rectangles must be translucent on empty canvas, rather than over the opaque disk.
  const rgba = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 88; y < 168; y++)
    for (let x = 48; x < 208; x++)
      if (x < 104 || x >= 152) {
        const i = (y * 256 + x) * 4;
        rgba.data.set(x < 104 ? [0, 204, 136, 128] : [255, 224, 128, 192], i);
      }
  let fixture = await sharp(rgba.data, { raw: rgba.info }).png().toBuffer();
  if (portrait) {
    const rgb = await sharp("data/scope-qa/astronaut.png")
      .resize(256, 256)
      .removeAlpha()
      .raw()
      .toBuffer();
    const alpha = await sharp("data/scope-qa/portrait.mask.png")
      .resize(256, 256)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer();
    fixture = await sharp(rgb, {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .joinChannel(alpha, { raw: { width: 256, height: 256, channels: 1 } })
      .png()
      .toBuffer();
  }
  writeFileSync(`${root}/source.png`, fixture);
  const runs: object[] = [];
  for (const task of ["Upscale", "Restore"] as const) {
    const size = task === "Upscale" ? 512 : 256;
    const queue = await client.queue();
    if (queue.queue_running.length || queue.queue_pending.length)
      throw Error("Engine busy");
    const { engine, resized } = await finishInput(fixture, task, size, size);
    const graph = finishGraph(task, await client.uploadReference(engine));
    preflightFinish(graph, inspection.info, graph["1"]!.inputs.image as string);
    const started = Date.now(),
      promptId = await client.submit(graph, randomUUID());
    console.log(JSON.stringify({ task, promptId }));
    let raw: Buffer | undefined;
    while (Date.now() - started < 300000) {
      const h = await client.history(promptId);
      if (h?.status?.status_str === "error") throw Error("GPU finish failed");
      if (h?.status?.completed) {
        raw = await client.image(h.outputs["99"].images[0]);
        break;
      }
      await delay(500);
    }
    if (!raw) throw Error("GPU finish timed out");
    const preserve = portrait
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
    const oldResult = await old.finishOutput(
      fixture,
      raw,
      task,
      size,
      size,
      task === "Restore" ? preserve : undefined,
    );
    const result = await finishOutput(
      fixture,
      raw,
      task,
      size,
      size,
      task === "Restore" ? preserve : undefined,
    );
    const a = await sharp(resized).ensureAlpha().raw().toBuffer(),
      b = await sharp(oldResult).ensureAlpha().raw().toBuffer(),
      c = await sharp(result).ensureAlpha().raw().toBuffer();
    let beforeError = 0,
      afterError = 0,
      samples = 0,
      opaque = 0,
      protectedPixels = 0;
    for (let i = 0; i < size * size; i++) {
      const alpha = a[i * 4 + 3]!;
      assert.equal(c[i * 4 + 3], alpha);
      if (alpha === 255) {
        assert.ok(
          b.subarray(i * 4, i * 4 + 4).equals(c.subarray(i * 4, i * 4 + 4)),
        );
        opaque++;
      }
      if (alpha >= 32 && alpha < 255)
        for (let k = 0; k < 3; k++) {
          beforeError += Math.abs(b[i * 4 + k]! - a[i * 4 + k]!);
          afterError += Math.abs(c[i * 4 + k]! - a[i * 4 + k]!);
          samples++;
        }
      const x = i % size,
        y = Math.floor(i / size);
      if (
        task === "Restore" &&
        x >= preserve[0]!.x &&
        x < preserve[2]!.x &&
        y >= preserve[0]!.y &&
        y < preserve[2]!.y
      ) {
        assert.ok(
          a.subarray(i * 4, i * 4 + 4).equals(c.subarray(i * 4, i * 4 + 4)),
        );
        protectedPixels++;
      }
    }
    for (const [name, bytes] of [
      ["raw", raw],
      ["old", oldResult],
      ["result", result],
    ] as const)
      writeFileSync(`${root}/${task}.${name}.png`, bytes);
    const tiles = [];
    for (const [y, bytes] of [resized, oldResult, result].entries())
      for (const [x, bg] of ["#ffffff", "#808080", "#101010"].entries())
        tiles.push({
          input: await sharp(bytes)
            .resize(256, 256)
            .flatten({ background: bg })
            .png()
            .toBuffer(),
          left: x * 256,
          top: y * 256,
        });
    await sharp({
      create: { width: 768, height: 768, channels: 3, background: "black" },
    })
      .composite(tiles)
      .png()
      .toFile(`${root}/${task}.review.png`);
    runs.push({
      task,
      promptId,
      elapsedMs: Date.now() - started,
      sourceHash: hash(fixture),
      rawHash: hash(raw),
      outputHash: hash(result),
      alphaExact: true,
      opaquePixelsUnchanged: opaque,
      protectedPixels,
      protectedPixelsExact: task === "Restore" ? true : null,
      translucentRgbMaeBefore: beforeError / samples,
      translucentRgbMaeAfter: afterError / samples,
      visualReview: "pending",
    });
    console.log(JSON.stringify(runs.at(-1)));
  }
  writeFileSync(
    `${root}/runs.json`,
    JSON.stringify(
      {
        implementationHash: finishSignature(),
        engineFingerprint: inspection.status.fingerprint,
        engineVersion: inspection.status.version,
        modelHashes,
        nodeFingerprint: finishNodeFingerprint(inspection.info),
        runs,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  unlinkSync(baseline);
}
