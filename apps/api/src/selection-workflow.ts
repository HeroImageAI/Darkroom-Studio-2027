import { createHash } from "node:crypto";
import { readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { modelRoots } from "./inventory.js";
import type {
  Graph,
  ObjectInfo,
} from "../../../packages/workflows/src/manifest.js";
export const selectionModel = "sam3.1_multiplex_fp16.safetensors";
export function selectionGraph(image: string, description: string): Graph {
  const graph: Graph = {
    "1": {
      class_type: "LoadImage",
      inputs: { image },
      _meta: { title: "DR_INPUT" },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: selectionModel },
      _meta: { title: "DR_SELECTION_MODEL" },
    },
    "3": {
      class_type: "SAM3_Detect",
      inputs: {
        model: ["2", 0],
        image: ["1", 0],
        threshold: 0.5,
        refine_iterations: 0,
        individual_masks: false,
        ...(description ? { conditioning: ["5", 0] } : {}),
      },
      _meta: { title: "DR_SELECTION" },
    },
    "4": {
      class_type: "MaskToImage",
      inputs: { mask: ["3", 0] },
      _meta: { title: "DR_MASK" },
    },
    "99": {
      class_type: "SaveImage",
      inputs: {
        images: ["4", 0],
        filename_prefix: "darkroom-studio-2027/selection",
      },
      _meta: { title: "DR_OUTPUT" },
    },
  };
  if (description)
    graph["5"] = {
      class_type: "CLIPTextEncode",
      inputs: { text: description, clip: ["2", 1] },
      _meta: { title: "DR_DESCRIPTION" },
    };
  return graph;
}
export function selectionNodeFingerprint(info: ObjectInfo) {
  const names = [
      "LoadImage",
      "CheckpointLoaderSimple",
      "SAM3_Detect",
      "CLIPTextEncode",
      "MaskToImage",
      "SaveImage",
    ],
    subset = structuredClone(
      Object.fromEntries(names.map((n) => [n, info[n]])),
    );
  if (subset.LoadImage?.input.required?.image)
    subset.LoadImage.input.required.image[0] = ["__INPUT__"];
  return createHash("sha256").update(JSON.stringify(subset)).digest("hex");
}
const loadedSelectionSignature = createHash("sha256")
  .update(readFileSync("apps/api/src/selection-workflow.ts"))
  .update(readFileSync("apps/api/src/selection.ts"))
  .digest("hex");
export const selectionSignature = () => loadedSelectionSignature;
let cached:
  { path: string; size: number; mtime: number; hash: string } | undefined;
export async function selectionModelHash() {
  for (const root of modelRoots()) {
    const path = join(root, "checkpoints", selectionModel);
    let before;
    try {
      before = await stat(path);
    } catch {
      continue;
    }
    if (
      cached?.path === path &&
      cached.size === before.size &&
      cached.mtime === before.mtimeMs
    )
      return cached.hash;
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    const after = await stat(path);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw Error("Selection model changed during validation");
    cached = {
      path,
      size: after.size,
      mtime: after.mtimeMs,
      hash: hash.digest("hex"),
    };
    return cached.hash;
  }
  throw Error("The local selection model is missing");
}
export async function assertSelectionReady(info: ObjectInfo, version?: string) {
  const evidence = JSON.parse(
    readFileSync("workflows/selection-validation.json", "utf8"),
  );
  if (
    !evidence.enabled ||
    evidence.engineVersion !== version ||
    evidence.nodeFingerprint !== selectionNodeFingerprint(info) ||
    evidence.implementationHash !== selectionSignature() ||
    evidence.modelHash !== (await selectionModelHash())
  )
    throw Error(
      "Smart Select needs local validation before use. Rectangle, Lasso and refinement remain available.",
    );
}
