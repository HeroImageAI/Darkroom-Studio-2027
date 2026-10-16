// Small independently assembled image graph using core ComfyUI node contracts.
// Regenerate only when deliberately revising this workflow; preflight checks its hash.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const graph = {};
const node = (id, type, title, inputs) => {
  graph[id] = { class_type: type, _meta: { title }, inputs };
};
node("model", "UNETLoader", "DR_MODEL", {
  unet_name: "flux-2-klein-9b-fp8.safetensors",
  weight_dtype: "default",
});
node("encoder", "CLIPLoader", "DR_ENCODER", {
  clip_name: "qwen_3_8b_fp8mixed.safetensors",
  type: "flux2",
  device: "default",
});
node("vae", "VAELoader", "DR_VAE", { vae_name: "flux2-vae.safetensors" });
node("prompt", "CLIPTextEncode", "DR_PROMPT", {
  text: "",
  clip: ["encoder", 0],
});
node("negative", "ConditioningZeroOut", "DR_NEGATIVE", {
  conditioning: ["prompt", 0],
});
node("width", "PrimitiveInt", "DR_WIDTH", { value: 512 });
node("height", "PrimitiveInt", "DR_HEIGHT", { value: 512 });
node("latent", "EmptyFlux2LatentImage", "DR_LATENT", {
  width: ["width", 0],
  height: ["height", 0],
  batch_size: 1,
});
node("schedule", "Flux2Scheduler", "DR_SCHEDULE", {
  steps: 4,
  width: ["width", 0],
  height: ["height", 0],
});
node("sampler", "KSamplerSelect", "DR_SAMPLER", { sampler_name: "euler" });
node("noise", "RandomNoise", "DR_SEED", { noise_seed: 2027 });
node("guider", "CFGGuider", "DR_GUIDER", {
  model: ["model", 0],
  positive: ["prompt", 0],
  negative: ["negative", 0],
  cfg: 1,
});
node("sample", "SamplerCustomAdvanced", "DR_SAMPLE", {
  noise: ["noise", 0],
  guider: ["guider", 0],
  sampler: ["sampler", 0],
  sigmas: ["schedule", 0],
  latent_image: ["latent", 0],
});
node("decode", "VAEDecodeTiled", "DR_DECODE", {
  samples: ["sample", 0],
  vae: ["vae", 0],
  tile_size: 512,
  overlap: 64,
  temporal_size: 64,
  temporal_overlap: 8,
});
node("output", "SaveImage", "DR_OUTPUT", {
  images: ["decode", 0],
  filename_prefix: "darkroom-studio-2027/foundation",
});
const manifest = {
  schemaVersion: 1,
  id: "image.generate.klein.foundation",
  version: "1.0.0",
  modelFamily: "Klein",
  graphSha256: createHash("sha256").update(JSON.stringify(graph)).digest("hex"),
  bindings: {
    prompt: { title: "DR_PROMPT", input: "text", type: "string" },
    width: { title: "DR_WIDTH", input: "value", type: "integer" },
    height: { title: "DR_HEIGHT", input: "value", type: "integer" },
    seed: { title: "DR_SEED", input: "noise_seed", type: "integer" },
  },
  outputs: [{ title: "DR_OUTPUT", kind: "image", alpha: false }],
  models: [
    {
      title: "DR_MODEL",
      input: "unet_name",
      filename: "flux-2-klein-9b-fp8.safetensors",
      source: "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B",
      licenceStatus:
        "Source/licence terms must be reviewed for intended use; no download performed",
    },
    {
      title: "DR_ENCODER",
      input: "clip_name",
      filename: "qwen_3_8b_fp8mixed.safetensors",
      source: "Existing local ComfyUI installation",
      licenceStatus:
        "Existing local weight; licence not independently verified",
    },
    {
      title: "DR_VAE",
      input: "vae_name",
      filename: "flux2-vae.safetensors",
      source: "Existing local ComfyUI installation",
      licenceStatus:
        "Existing local weight; licence not independently verified",
    },
  ],
  maxPixels: 1048576,
  validationEvidenceId: null,
  enabled: false,
};
writeFileSync(
  "workflows/graphs/klein-foundation.json",
  JSON.stringify(graph, null, 2) + "\n",
);
writeFileSync(
  "workflows/manifests/klein-foundation.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
