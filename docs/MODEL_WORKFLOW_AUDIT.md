# Prompt and workflow audit

17 October 2026. Sources below were checked directly. This audit is diagnostic and does not enable or replace routes.

## Publisher guidance and installed behaviour

- [BFL Klein guidance](https://help.bfl.ai/articles/7592221790-how-do-i-generate-quickly-with-flux-2-klein): use specific natural-language scene descriptions; the model does not perform prompt upsampling. Darkroom preserves the user's brief and must not silently invent narrative details. Local distilled Klein uses four steps and CFG 1; keep its measured routing evidence rather than borrowing Base-model settings.
- [Qwen Image 2.1 model card](https://huggingface.co/Qwen/Qwen-Image-2.1): the generation/edit examples use 40 steps; the documented transparent-image prompt explicitly requests RGBA, an alpha channel and a transparent background. Final currently uses 40 steps. Native transparency warrants a controlled comparison before adding another model or changing the production removal route.
- [ComfyUI Qwen node implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_qwen.py): compare with the installed source, not just current upstream. The installed `TextEncodeQwenImage21` preserves RGBA into the reference VAE, composites alpha over white for vision, and returns a latent matching its resized first reference. Its tooltip warns that sampling at a different size shifts edits.
- [Meta SAM documentation](https://github.com/facebookresearch/sam3): text and geometric prompts are distinct capabilities. A successful text mask does not establish correct object clicks or positional language. The installed checkpoint is SAM 3.1 multiplex; validate that actual adapter rather than treating generic SAM documentation as a compatibility certificate.

## Immediate investigations

1. Compare Qwen native RGBA extraction on the existing controlled glass fixtures; measure actual alpha and foreground/design fidelity. Standard VAE decoding is not by itself proof that alpha is discarded: inspect the returned channel count before drawing that conclusion.
2. Check reference-resize versus output-latent geometry in Edit. Current graphs sample a separately sized latent while the encoder resizes references to a target area. Test matched geometry before changing prompts or segmentation to compensate for a possible spatial mismatch.
3. Continue photographic garment, product and artwork checks with exact protected-region comparisons and actual visual review.

Publisher examples are starting points, not workstation quality guarantees. No checkpoint, runtime package or enabled graph changed during this audit. Record source/licence metadata accurately as part of release readiness; do not infer commercial permissions from model availability.

## Native Qwen alpha comparison

`scripts/check-qwen-alpha.ts` completed six live GPU cases using the installed Qwen weights, 40 steps, CFG 1, Euler/simple and seed 42. Two existing controlled glass fixtures are tested with the current graph, native-size reference/latent matching, and area-resized reference/latent matching. The latter decodes at 672 x 896 and is resized to 384 x 512 for measurement; these timings are not matched-resolution speed comparisons.

All outputs have four actual channels. Therefore the current standard tiled VAE decode already preserves native Qwen alpha; no special alpha decoder is needed. The absence of a production extraction route, rather than a missing decoder, is the relevant distinction.

Interior alpha errors on white/blue are respectively 27.29/20.62 (current), 48.03/111.40 (native-size matched), and 217.00/36.60 (area matched). Visual inspection of all six results shows altered glass density, retained input-background tint, and an opaque white body in the white/area-matched case. The opaque label/line motif is broadly retained, but this does not establish exact design fidelity. None closes the glass extraction gate. Do not promote native extraction or geometry changes from these results. Geometry effects on ordinary local edits remain a separate investigation.

Evidence: `workflows/qwen-alpha-comparison.json`, with source/output/graph/model hashes, exact prompts and engine fingerprint. Review image and raw outputs remain in ignored local fixture storage. No user project or enabled workflow changed.

## Local-edit reference geometry

Six further live cases compare current, native-size matched and area-matched sampling on a reviewed photographic garment mask and the owned sphere fixture. All protected pixels remain exact (210,736 garment; 545,824 sphere). All variants remove orange from the selected region. Native matching reduces raw protected-region RGB error from 8.13 to 7.14 on the garment, but the delivered fabric and seams do not demonstrate a sufficient consistent advantage. Mask omissions are still mask omissions.

The sphere's three delivered PNGs are byte-identical. Inspection shows a blue sphere and an intact protected label, but also a rectangular background join inside the allowed region. This is a partial outcome, despite the exact protected pixels and correct requested colour. Geometry matching does not fix it. Do not promote either alternate on this evidence. A local-edit seam correction must preserve intended recolour at object edges rather than restoring the old pigment.

`scripts/check-edit-geometry.ts` records submissions for observation/recovery and never enables a graph. `workflows/edit-geometry-comparison.json` pins source/mask/output/model/graph hashes and the failed/partial assessments. The area-matched garment run samples 768 square versus 512 for the other garment runs, so timings are not a matched speed benchmark.
