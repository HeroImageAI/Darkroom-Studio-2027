# Quality work following PR #9 review

## 1. Whole-garment selection

A two-pixel, source-colour-aware boundary experiment recovered 1,227 pixels, but 441 additions overlapped manually protected regions. It is rejected as an automatic change. The native selection workflow is unchanged.

A reviewed fixture mask explicitly protects badges, the head, collar hardware and helmet. A new real Qwen edit retains all 210,736 unselected pixels exactly and produces navy fabric with its folds. This is a scoped manual result. Bindings and seams still require delivery review, and general automatic garment selection remains partial.

Reproduce with `scripts/check-garment-boundary.ts`, inspect the overlay, then run the `garment-reviewed-boundary` case in `scripts/validate-photo-corrections.ts`. The annotation is pinned to the source hash in `tests/golden/garment-protection.json`; it must never be applied to another image. Evidence: `workflows/garment-boundary-comparison.json` and `workflows/photo-corrections-qa.json`.

## 2. Upscale colour fidelity

Sixteen local GPU comparisons hold the source, requested size and seed constant while comparing the installed Lab, wavelet, AdaIN and no-transfer settings. No alternate setting consistently wins across the graphic and photograph, so Lab remains enabled.

The decisive correction is the encoder fix described in `PR9_REVIEW.md`. Both tested upscalers exposed the same double-unpremultiplication issue. Recomposition of retained raw output fixes the major translucent tint without changing the model or graph. Source-opacity and protected-detail rules are retained.

An isolated Real-ESRGAN x4plus candidate also ran on both inputs and the degraded portrait. After correcting encoding, it has no consistent advantage: translucent RGB MAE is 6.89 versus 3.04 on the graphic and 19.69 versus 19.56 on the photograph. Its opaque photographic MAE improves somewhat (8.87 versus 9.46). It is not enabled. See `workflows/finish-colour-comparison.json` and `workflows/realesrgan-comparison.json`.

## 3. Restoration and glass

### Restoration

Known-reference measurements make the limitation explicit. The degraded head has PSNR 30.06 dB; the unprotected SeedVR2 head has 26.97 dB. The protected result preserves all 30,240 head-region pixels and therefore remains at 30.06 dB. These numbers measure distortion, not identity. The face comparison was inspected; unprotected generation is not accepted as identity repair.

The Real-ESRGAN candidate improves surrounding-region PSNR over SeedVR2 (28.20 to 28.92 dB), but remains below the degraded input (29.89 dB). Neither result closes general restoration quality. Protected source details remain the enabled behaviour. Evidence: `workflows/restoration-limits.json` and `workflows/realesrgan-comparison.json`.

### Glass

The current BiRefNet route fails a controlled synthetic transparency check on two input backgrounds: expected interior alpha is 38/255, predicted alpha is 254/255. Its source RGB remains exact, but the body becomes opaque and the extracted silhouette is incomplete.

An isolated ViTMatte Small experiment with a manually supplied trimap improves interior alpha error from 216 to 12.72 on white and 7.11 on blue; opaque label alpha remains approximately 255. The resulting alpha and contrasting-background composites were inspected. This is promising guided synthetic evidence, not automatic or photographic glass certification. Foreground colour still comes from the original flattened input, so transmitted-background colour recovery also remains open.

Next gate: licensed photographic clear-glass examples with meaningful foreground/transparency references, then a reviewed native ComfyUI adapter and full validation. No matting route was enabled. Evidence: `workflows/glass-matting-comparison.json`.

## Candidate model provenance

The name, purpose, size and publisher source were shown before each download, as required by the product brief. Both checkpoints are excluded from Git and stored only in `data/quality-gaps/`.

| Candidate | Checkpoint size | Publisher/source | Licence listed by publisher |
| --- | ---: | --- | --- |
| ViTMatte Small, Composition-1k | 103,294,572 bytes | [HUST model revision](https://huggingface.co/hustvl/vitmatte-small-composition-1k/tree/6a58ad7646403c1df626fbd746900aec7361ea1d) | Apache-2.0 |
| RealESRGAN x4plus | 67,040,989 bytes | [Author's v0.1.0 release](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.0) | Publisher project: BSD-3-Clause |

Checksums and runtime versions are recorded in the evidence. ViTMatte uses an image plus a trimap, as specified by the [official Transformers documentation](https://huggingface.co/docs/transformers/model_doc/vitmatte). The existing ComfyUI Python environment already provided the required libraries; no package installation or ComfyUI model-directory change was made. CUDA peak allocation and timings are scoped observations, not total workstation VRAM or matched speed comparisons.

## Status

Implemented: review corrections and regression tests. Live: one reviewed garment edit, sixteen colour-method cases, two controlled baseline glass cases, two guided matting cases and three isolated SR cases. Retained restoration data was evaluated separately. Not implemented: automatic garment-boundary promotion, alternate colour routing, general identity repair, or a production matting route. Library expansion stays on hold. PR #9 remains unmerged for review.
