import type {
  Graph,
  ObjectInfo,
} from "../../../packages/workflows/src/manifest.js";
import { graphHash, preflight } from "../../../packages/workflows/src/bind.js";
import sharp from "sharp";
export type FinishTask = "Restore" | "Upscale" | "Remove background";
type Point = { x: number; y: number };
export function finishEngineSize(
  task: FinishTask,
  width: number,
  height: number,
) {
  const scale = task === "Restore" ? 2 : 1;
  if (width * scale > 2048 || height * scale > 2048)
    throw Error("Finishing working resolution exceeds 2048 pixels per side");
  return { width: width * scale, height: height * scale };
}
export function finishGraph(task: FinishTask, image: string): Graph {
  const graph: Graph = {};
  function node(
    id: string,
    class_type: string,
    inputs: Record<string, unknown>,
    title = class_type,
  ) {
    graph[id] = { class_type, inputs, _meta: { title } };
  }
  node("1", "LoadImage", { image }, "DR_INPUT");
  if (task === "Remove background") {
    node(
      "2",
      "LoadBackgroundRemovalModel",
      { bg_removal_name: "birefnet.safetensors" },
      "DR_BG_MODEL",
    );
    node("3", "RemoveBackground", {
      bg_removal_model: ["2", 0],
      image: ["1", 0],
    });
    node("4", "MaskToImage", { mask: ["3", 0] });
    node(
      "99",
      "SaveImage",
      { images: ["4", 0], filename_prefix: "darkroom-studio-2027/finish" },
      "DR_OUTPUT",
    );
  } else {
    node(
      "2",
      "UNETLoader",
      {
        unet_name: "seedvr2_7b_sharp_int8_convrot.safetensors",
        weight_dtype: "default",
      },
      "DR_MODEL",
    );
    node("3", "VAELoader", { vae_name: "ema_vae_fp16.safetensors" }, "DR_VAE");
    node("4", "SeedVR2Preprocess", { resized_images: ["1", 0] });
    node("5", "VAEEncodeTiled", {
      pixels: ["4", 0],
      vae: ["3", 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
    });
    node("6", "SeedVR2Conditioning", {
      model: ["2", 0],
      vae_conditioning: ["5", 0],
    });
    node("7", "KSampler", {
      model: ["2", 0],
      seed: 42,
      steps: 1,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      positive: ["6", 0],
      negative: ["6", 1],
      latent_image: ["5", 0],
      denoise: 1,
    });
    node("8", "VAEDecodeTiled", {
      samples: ["7", 0],
      vae: ["3", 0],
      tile_size: 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
    });
    node("9", "SeedVR2PostProcessing", {
      images: ["8", 0],
      original_resized_images: ["1", 0],
      color_correction_method: "lab",
    });
    node(
      "99",
      "SaveImage",
      { images: ["9", 0], filename_prefix: "darkroom-studio-2027/finish" },
      "DR_OUTPUT",
    );
  }
  return graph;
}
export function preflightFinish(
  graph: Graph,
  info: ObjectInfo,
  uploaded: string,
) {
  return preflight(
    graph,
    {
      graphSha256: graphHash(graph),
      bindings: {
        image: { title: "DR_INPUT", input: "image", type: "string" },
      },
      outputs: [{ title: "DR_OUTPUT", kind: "image", alpha: false }],
      models: [],
    },
    info,
    new Set([uploaded]),
  );
}
export async function finishInput(
  source: Buffer,
  task: FinishTask,
  width: number,
  height: number,
) {
  const resized = await sharp(source)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .png()
    .toBuffer();
  return {
    resized,
    engine: await sharp(resized)
      .resize(
        finishEngineSize(task, width, height).width,
        finishEngineSize(task, width, height).height,
        { fit: "fill", kernel: "lanczos3" },
      )
      .flatten({
        background: task === "Remove background" ? "#ffffff" : "#808080",
      })
      .png()
      .toBuffer(),
  };
}
export async function finishOutput(
  source: Buffer,
  raw: Buffer,
  task: FinishTask,
  width: number,
  height: number,
  preserve?: Point[],
) {
  if (task === "Restore" && (!preserve || preserve.length < 3))
    throw Error("Select the lettering or details to preserve before restoring");
  const resized = await sharp(source)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const meta = await sharp(raw).metadata();
  const engineSize = finishEngineSize(task, width, height);
  if (meta.width !== engineSize.width || meta.height !== engineSize.height)
    throw Error("Finish result dimensions do not match request");
  if (task === "Remove background") {
    const mask = await sharp(raw).removeAlpha().greyscale().raw().toBuffer();
    for (let i = 0; i < width * height; i++)
      resized.data[i * 4 + 3] = Math.round(
        (resized.data[i * 4 + 3]! * mask[i]!) / 255,
      );
    return sharp(resized.data, { raw: resized.info }).png().toBuffer();
  }
  const rgb = await sharp(raw)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let protectedPixels: Buffer | undefined, transition: Buffer | undefined;
  if (task === "Restore") {
    const polygon = preserve!.map((p) => `${p.x},${p.y}`).join(" ");
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><polygon points="${polygon}" fill="white"/></svg>`,
    );
    protectedPixels = await sharp(mask).greyscale().raw().toBuffer();
    transition = await sharp(mask).blur(3).greyscale().raw().toBuffer();
  }
  for (let i = 0; i < width * height; i++)
    for (let c = 0; c < 3; c++) {
      const t = protectedPixels?.[i]
        ? 0
        : transition
          ? Math.max(0, 1 - (2 * transition[i]!) / 255)
          : 1;
      resized.data[i * 4 + c] = Math.round(
        resized.data[i * 4 + c]! * (1 - t) + rgb[i * 3 + c]! * t,
      );
    }
  return sharp(resized.data, { raw: resized.info }).png().toBuffer();
}
