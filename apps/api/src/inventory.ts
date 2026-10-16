import { readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { manifest } from "./workflow.js";
type FileEvidence = {
  filename: string;
  sha256: string;
  byteSize: number;
  modifiedMs: number;
};
const cache = new Map<string, { size: number; mtime: number; hash: string }>();
let pending: Promise<FileEvidence[]> | undefined;
function roots() {
  const result: string[] = [];
  try {
    const settings = JSON.parse(
      readFileSync(
        join(process.env.APPDATA ?? "", "Comfy Desktop", "settings.json"),
        "utf8",
      ),
    );
    result.push(...settings.modelsDirs);
  } catch {
    /* Explicit roots can be used outside Desktop. */
  }
  try {
    const installs = JSON.parse(
      readFileSync(
        join(process.env.APPDATA ?? "", "Comfy Desktop", "installations.json"),
        "utf8",
      ),
    );
    for (const i of installs)
      if (i.installPath) result.push(join(i.installPath, "ComfyUI", "models"));
  } catch {}
  if (process.env.DR_MODEL_ROOTS)
    result.unshift(...process.env.DR_MODEL_ROOTS.split(";"));
  return [...new Set(result)];
}
async function scan() {
  const output: FileEvidence[] = [];
  for (const model of manifest.models) {
    const folder =
      model.title === "DR_MODEL"
        ? "diffusion_models"
        : model.title === "DR_ENCODER"
          ? "text_encoders"
          : "vae";
    let found = false;
    for (const root of roots()) {
      const path = join(root, folder, model.filename);
      let s;
      try {
        s = await stat(path);
      } catch {
        continue;
      }
      if (!s.isFile()) continue;
      const old = cache.get(path);
      let hash =
        old?.size === s.size && old.mtime === s.mtimeMs ? old.hash : undefined;
      if (!hash) {
        const digest = createHash("sha256");
        for await (const bytes of createReadStream(path)) digest.update(bytes);
        hash = digest.digest("hex");
        const after = await stat(path);
        if (after.size !== s.size || after.mtimeMs !== s.mtimeMs)
          throw Error("Model changed while being checked");
        cache.set(path, { size: s.size, mtime: s.mtimeMs, hash });
      }
      output.push({
        filename: model.filename,
        sha256: hash,
        byteSize: s.size,
        modifiedMs: s.mtimeMs,
      });
      found = true;
      break;
    }
    if (!found)
      throw Error(
        `Cannot locate model file for verification: ${model.filename}`,
      );
  }
  return output;
}
export async function modelInventory() {
  if (pending) return pending;
  pending = scan();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
