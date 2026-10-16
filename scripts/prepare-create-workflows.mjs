import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base = JSON.parse(
  readFileSync("workflows/graphs/klein-foundation.json", "utf8"),
);
const foundation = JSON.parse(
  readFileSync("workflows/manifests/klein-foundation.json", "utf8"),
);
const index = [];
for (const family of ["Klein", "Qwen"])
  for (let count = 0; count <= 3; count++) {
    const g = family === "Klein" ? structuredClone(base) : {};
    const node = (id, type, title, inputs) =>
      (g[id] = { class_type: type, _meta: { title }, inputs });
    if (family === "Qwen") {
      node("model", "UNETLoader", "DR_MODEL", {
        unet_name: "qwen_image_2.1_int8_convrot.safetensors",
        weight_dtype: "default",
      });
      node("encoder", "CLIPLoader", "DR_ENCODER", {
        clip_name: "qwen3vl_8b_int8_convrot.safetensors",
        type: "qwen_image",
        device: "default",
      });
      node("vae", "VAELoader", "DR_VAE", {
        vae_name: "qwen_image_2.1_vae_bf16.safetensors",
      });
      node("prompt", "TextEncodeQwenImage21", "DR_PROMPT", {
        clip: ["encoder", 0],
        prompt: "",
        negative_prompt: "",
        resolution: 768,
        ...(count ? { vae: ["vae", 0] } : {}),
      });
      node("width", "PrimitiveInt", "DR_WIDTH", { value: 768 });
      node("height", "PrimitiveInt", "DR_HEIGHT", { value: 768 });
      node("latent", "EmptyLatentImage", "DR_LATENT", {
        width: ["width", 0],
        height: ["height", 0],
        batch_size: 1,
      });
      node("sample", "KSampler", "DR_SAMPLE", {
        model: ["model", 0],
        positive: ["prompt", 0],
        negative: ["prompt", 1],
        latent_image: ["latent", 0],
        seed: 2027,
        steps: 25,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1,
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
        filename_prefix: "darkroom-studio-2027/create",
      });
    }
    const bindings = {
      prompt: {
        title: "DR_PROMPT",
        input: family === "Klein" ? "text" : "prompt",
        type: "string",
      },
      width: { title: "DR_WIDTH", input: "value", type: "integer" },
      height: { title: "DR_HEIGHT", input: "value", type: "integer" },
      seed: {
        title: family === "Klein" ? "DR_SEED" : "DR_SAMPLE",
        input: family === "Klein" ? "noise_seed" : "seed",
        type: "integer",
      },
      steps: {
        title: family === "Klein" ? "DR_SCHEDULE" : "DR_SAMPLE",
        input: "steps",
        type: "integer",
      },
    };
    let pos = ["prompt", 0],
      neg = ["negative", 0];
    for (let i = 1; i <= count; i++) {
      node("ref" + i, "LoadImage", "DR_REF_" + i, {
        image: "__REFERENCE_" + i + "__",
      });
      bindings["reference" + i] = {
        title: "DR_REF_" + i,
        input: "image",
        type: "string",
      };
      if (family === "Qwen")
        g.prompt.inputs["images.image_" + i] = ["ref" + i, 0];
      else {
        node("scale" + i, "ImageScaleToTotalPixels", "DR_SCALE_" + i, {
          image: ["ref" + i, 0],
          upscale_method: "lanczos",
          megapixels: 0.6,
          resolution_steps: 16,
        });
        node("encode" + i, "VAEEncode", "DR_ENCODE_" + i, {
          pixels: ["scale" + i, 0],
          vae: ["vae", 0],
        });
        node("pos" + i, "ReferenceLatent", "DR_POS_" + i, {
          conditioning: pos,
          latent: ["encode" + i, 0],
        });
        node("neg" + i, "ReferenceLatent", "DR_NEG_" + i, {
          conditioning: neg,
          latent: ["encode" + i, 0],
        });
        pos = ["pos" + i, 0];
        neg = ["neg" + i, 0];
      }
    }
    if (family === "Klein") {
      g.guider.inputs.positive = pos;
      g.guider.inputs.negative = neg;
      g.output.inputs.filename_prefix = "darkroom-studio-2027/create";
    }
    const id = `create.${family.toLowerCase()}.${count}ref`;
    const models =
      family === "Klein"
        ? foundation.models
        : [
            {
              title: "DR_MODEL",
              input: "unet_name",
              filename: "qwen_image_2.1_int8_convrot.safetensors",
              source: "Existing ComfyUI Desktop installation",
              licenceStatus: "Verify authoritative terms for intended use",
            },
            {
              title: "DR_ENCODER",
              input: "clip_name",
              filename: "qwen3vl_8b_int8_convrot.safetensors",
              source: "Existing ComfyUI Desktop installation",
              licenceStatus: "Verify authoritative terms for intended use",
            },
            {
              title: "DR_VAE",
              input: "vae_name",
              filename: "qwen_image_2.1_vae_bf16.safetensors",
              source: "Existing ComfyUI Desktop installation",
              licenceStatus: "Verify authoritative terms for intended use",
            },
          ];
    const m = {
      schemaVersion: 1,
      id,
      version: "1.0.0",
      modelFamily: family,
      referenceCount: count,
      qualitySteps:
        family === "Klein" ? { Draft: 4, Final: 4 } : { Draft: 25, Final: 40 },
      graphSha256: createHash("sha256").update(JSON.stringify(g)).digest("hex"),
      bindings,
      outputs: [{ title: "DR_OUTPUT", kind: "image", alpha: false }],
      models,
      maxPixels: 1572864,
      validationEvidenceId: null,
      validationFingerprint: null,
      enabled: false,
    };
    writeFileSync(
      `workflows/graphs/${id}.json`,
      JSON.stringify(g, null, 2) + "\n",
    );
    writeFileSync(
      `workflows/manifests/${id}.json`,
      JSON.stringify(m, null, 2) + "\n",
    );
    index.push(id);
  }
writeFileSync(
  "workflows/create-index.json",
  JSON.stringify(index, null, 2) + "\n",
);
