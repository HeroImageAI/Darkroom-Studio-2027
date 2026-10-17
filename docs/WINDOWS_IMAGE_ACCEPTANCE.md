# Windows image acceptance — 17 October 2026

This is quality/reliability work within CURRENT_SCOPE.md. The only product behaviour change is starting Create at Final quality. Auto still chooses the validated route; the visible manual model chooser and Draft remain available. API defaults and persisted requests are unchanged. No model, package, graph or additional control is introduced.

## Models

The installed Klein 9B, Qwen Image 2.1 and SeedVR2 7B Sharp remain the production stack. All eight generation/reference routes pass live preflight and installed-weight verification. The [Qwen model card](https://huggingface.co/Qwen/Qwen-Image-2.1) uses 40 steps for full generation/editing examples, matching Final. [BFL's Klein card](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B) describes its four-step distilled model. [SeedVR's official project](https://github.com/ByteDance-Seed/SeedVR) remains the restoration reference.

[Qwen Turbo](https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo) is a separate accelerated checkpoint with its own eight-step schedule. Its release is not evidence of a quality win on this workstation. It was not downloaded or enabled. There is no justified universal-best-model claim from the scoped checks below.

## Current checks

| Path | Execution and visual assessment |
| --- | --- |
| Full automated baseline | 119 unit/integration tests, strict TypeScript and production build pass locally; fresh Windows browser CI is recorded on the PR. |
| Live preflight | Eight installed generation/reference routes ready with verified model hashes. |
| Klein generation | 1024 square, four steps, seed 20271017. Two mugs, correct colours and readable NOIR. Scoped pass; no broad photographic certification. |
| Qwen generation | Same brief, dimensions and seed; 40 steps. Counts/lettering pass, but the blue mug is more glossy than the requested matte finish. Partial intent fidelity. |
| Qwen local recolour | Changes red mug to green and preserves 867,584 frozen-master protected pixels and all source alpha exactly. Heavy texture appears in the allowed region: visual FAIL. Never accepted into the master. |
| SeedVR2 upscale | Actual 1024→2048 result; readable NOIR and recognisable mug shapes retained. Scoped visual pass; no missing-detail truth claim. |
| Background removal | Actual 1024 cutout, inspected on dark background. Both handle holes removed; minor light edge remains. Scoped pass. |
| PNG/JPEG delivery | Real attachment downloads; hashes, dimensions, sRGB profile and 300 dpi verified. Master unchanged. |
| Restore, complex selection/glass | Previous limitations remain open; these were not certified by this pass. |

Sources are newly generated photographic-style images in a dedicated QA project, not real-world product reference photos. All job IDs, prompts, seeds, graph/engine/model fingerprints and output hashes are in workflows/windows-image-acceptance.json. Binary files remain ignored under data/windows-image-acceptance. Actions are tested independently on the QA master; the failed edit is not accepted and then passed to Finish.

## Edit investigation

Flattened RGB input, removing the mask reference, native matched reference/output geometry, and disabled prefix cache all retain the Qwen texture failure. Cache-off output is byte-identical to the flattened two-reference result; it does not justify disabling the cache. No engine code or production route was changed.

Klein one- and two-reference comparisons produce a substantially cleaner green mug with readable NOIR and smooth ceramic. This is a promising scoped candidate, not enough evidence to replace every Qwen edit route. Broader garment, object-edge and task checks remain necessary. The comparison is about the delivered result, not matched-step speed: Klein uses four distilled steps and Qwen uses 40. Timings include differing model residency and are not controlled cold/warm benchmarks.

Reproduce the app checks with `DR_QA_ORIGIN` set explicitly to the isolated preview and `node --import tsx scripts/validate-windows-image-quality.ts`. Saved requests/job IDs support observation/reuse without duplicating completed GPU work. `scripts/check-edit-input-alpha.ts` runs the isolated comparisons and does not enable a route. Reusing another preview store requires a separate QA ledger; scripts refuse an origin mismatch.

Follow-up: RECOLOUR_MODEL_VALIDATION.md records broader validation and the subsequent switch of Recolour alone to Klein. The failed Qwen results above remain historical failure evidence; other edit actions retain Qwen.
