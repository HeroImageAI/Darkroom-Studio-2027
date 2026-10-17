import { readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { modelRoots } from "./inventory.js";
import { finishGraph, type FinishTask } from "./finish-workflows.js";
import { graphHash } from "../../../packages/workflows/src/bind.js";
import type { ObjectInfo } from "../../../packages/workflows/src/manifest.js";
export const finishEvidence = () =>
  JSON.parse(readFileSync("workflows/finish-validation-v2.json", "utf8")) as {
    enabledTasks: FinishTask[];
    nodeFingerprint: string;
    modelHashes: Record<string, string>;
    templateHashes: Record<string, string>;
    implementationHash: string;
    evidenceId: string;
    engineVersion: string;
  };
import { canvasSignature } from "./render-signature.js";
const loadedFinishSignature = createHash("sha256")
  .update(readFileSync("apps/api/src/finish-workflows.ts"))
  .update(readFileSync("apps/api/src/finish-jobs.ts"))
  .update(canvasSignature())
  .digest("hex");
export const finishSignature = () => loadedFinishSignature;
export function finishNodeFingerprint(info: ObjectInfo) {
  const names = [
    ...new Set(
      ["Restore", "Remove background"].flatMap((task) =>
        Object.values(finishGraph(task as FinishTask, "__INPUT__")).map(
          (n) => n.class_type,
        ),
      ),
    ),
  ].sort();
  const subset = structuredClone(
    Object.fromEntries(names.map((n) => [n, info[n]])),
  );
  if (subset.LoadImage?.input.required?.image)
    subset.LoadImage.input.required.image[0] = ["<uploaded>"];
  return createHash("sha256").update(JSON.stringify(subset)).digest("hex");
}
export const finishModels = {
  "diffusion_models/seedvr2_7b_sharp_int8_convrot.safetensors": "SeedVR2",
  "vae/ema_vae_fp16.safetensors": "SeedVR2 VAE",
  "background_removal/birefnet.safetensors": "BiRefNet",
};
const cache = new Map<string, { size: number; mtime: number; hash: string }>();
export async function finishModelHashes() {
  const result: Record<string, string> = {};
  for (const file of Object.keys(finishModels))
    for (const root of modelRoots()) {
      const path = join(root, file);
      let before;
      try {
        before = await stat(path);
      } catch {
        continue;
      }
      let saved = cache.get(path);
      if (
        !saved ||
        saved.size !== before.size ||
        saved.mtime !== before.mtimeMs
      ) {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(path)) hash.update(chunk);
        const after = await stat(path);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
          throw Error("Finish model changed while being verified");
        saved = {
          size: before.size,
          mtime: before.mtimeMs,
          hash: hash.digest("hex"),
        };
        cache.set(path, saved);
      }
      result[file] = saved.hash;
      break;
    }
  return result;
}
export async function assertFinishReady(
  task: FinishTask,
  info: ObjectInfo,
  engineVersion?: string,
) {
  const e = finishEvidence();
  if (
    !e.enabledTasks.includes(task) ||
    e.engineVersion !== engineVersion ||
    e.implementationHash !== finishSignature() ||
    e.templateHashes[task] !== graphHash(finishGraph(task, "__INPUT__")) ||
    e.nodeFingerprint !== finishNodeFingerprint(info)
  )
    throw Error("This finishing workflow needs local validation before use.");
  const hashes = await finishModelHashes();
  const files =
    task === "Remove background"
      ? ["background_removal/birefnet.safetensors"]
      : [
          "diffusion_models/seedvr2_7b_sharp_int8_convrot.safetensors",
          "vae/ema_vae_fp16.safetensors",
        ];
  if (
    files.some(
      (file) => !e.modelHashes[file] || hashes[file] !== e.modelHashes[file],
    )
  )
    throw Error(
      "Finishing model content does not match the validated weights.",
    );
  return {
    evidenceId: e.evidenceId,
    modelHashes: Object.fromEntries(files.map((f) => [f, hashes[f]])),
    implementationHash: e.implementationHash,
    nodeFingerprint: e.nodeFingerprint,
    templateHash: e.templateHashes[task],
  };
}
