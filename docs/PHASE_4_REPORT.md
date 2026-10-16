# Phase 4 — Intelligent Edit

16 October 2026. Draft review candidate stacked on Edit foundation. No merge or Phase 5 work. The final manual Accept click remains pending approval after automatic approval review blocked it.

## IMPLEMENTED

Edit now supports selection → instruction → Apply → result review. Initial actions are Remove, Replace, Recolour, Background, Expand and Instruct. Users choose the intended result; central policy chooses validated Qwen Final workflows. Local actions use a second image as an allowed-region guide. Background/Expand use a separately validated one-reference path after guide artifacts were found during QA. Full compiled graphs, exact instructions, seeds, model/engine fingerprints, frozen source/mask hashes and edit routing evidence are retained in provenance.

Inside/outside targeting uses the saved rectangle/lasso selection. Background defaults to changing outside the selection so the selected subject stays protected. Expand supports bounded margins. Instruct can change the whole image when no selection is supplied; this intentionally offers no protected-region guarantee. The selection/allowed-region preview remains visible before important edits and is recoverable from edit history.

The server freezes and renders the saved master rather than asking the browser to upload an unverified screenshot. Source images are orientation-normalised in separate derived inputs; originals are unchanged. Renderer parity includes raster transforms, opacity, visibility and existing hide/reveal masks. Visible editable text layers and unsupported vector colours fail explicitly rather than silently substituting branding/fonts. Inputs are bounded to a 16-million-pixel canvas, 30 MB PNG asset limit and an engine working resolution up to 1024 on the long side, rounded to valid dimensions. Final proposals return to the original canvas size. This is not an upscaling-quality claim.

The worker serialises edits through the existing durable queue. It captures raw model output separately, then copies every protected RGBA pixel from the frozen input exactly. Boundary colour matching and a small inward transition operate only in allowed pixels for local edits; expansion never blends placeholder pixels into the original. Background bypasses colour matching around the protected silhouette. Internal source/mask/raw assets are excluded from normal Library listings.

Results appear in a central canvas review with before/result comparison, region preview, Accept, Reject, Keep as separate version and instruction reuse. No job automatically updates a master. Accept checks the base revision and adds a generated layer while retaining hidden original layers. A competing save blocks acceptance and offers a separate master/version. Request replays preserve the same key/seed/body; retries after a lost response return the same job. Rejected candidates remain recoverable. Worker recovery uses the same compositor and refuses to reinterpret output if its pinned renderer changed.

## NOT IMPLEMENTED

SAM/click-object selection, natural-language segmentation, selection add/subtract and brush refinement, specialised inpainting models, crop-and-stitch optimisation, finishing/upscaling/background-removal/export suite, new compositing/paint tools, editable branding creation or full Library/version browsing. No new models or dependencies were downloaded. Qwen is the only currently validated AI-edit family; optional model/quality choice is deliberately absent until there is comparative evidence.

## TEST RESULTS

63 unit/integration tests passed. Strict TypeScript and the production build passed. Eleven Chromium browser tests passed against the isolated final service. The two new AI review browser cases explicitly mock model completion while using real document storage; they verify the saved base, verbatim instruction, unchanged master before acceptance, comparison, acceptance/reload, exact lost-response retry and rejection.

Real SQLite/image tests independently verify exact protected RGBA bytes, inside/outside targeting, original preservation, expanded-canvas offsets, source rendering/masks, explicit review, immutable revisions, conflicting writes, separate versions, request replay without engine access, rejection/reopen and recovered model output through the protected compositor. Existing Create/Edit foundation cases still pass. CI results are reported separately in the handoff/PR; browser mocks are not GPU evidence.

## LIVE RESULTS

ComfyUI Desktop 0.41.2, RTX 3090, existing SHA-pinned weights. Thirteen actual model renders were executed while refining the implementation. Seven earlier candidates were failed/superseded because of protected-background rectangles, guide artifacts or visible joins; their raw files and assessments are retained. Six final cases passed the limited requested-outcome rubric after inspecting the actual composited images. This is not thirteen visual passes.

The owned fixture is a black NOIR / EAU DE PARFUM bottle, optionally with an orange sphere. Checks: remove the sphere completely; replace it with one blue cube; recolour it blue; make the background navy while preserving the selected bottle; extend the plain background upward without new objects; instruct the selected sphere to become green. Every protected pixel was compared exactly. The rubric establishes these scoped outcomes, not universal commercial image fidelity.

| Action | Graph | Model run | Sampled whole-GPU peak | Protected pixels exact |
| --- | --- | ---: | ---: | ---: |
| Remove | Qwen 2 references | 22.130 s | 21.3 GiB | 545,824 |
| Replace | Qwen 2 references | 22.461 s | 21.5 GiB | 545,824 |
| Recolour | Qwen 2 references | 21.873 s | 21.6 GiB | 545,824 |
| Background | Qwen 1 reference | 17.165 s | 19.2 GiB | 104,231 |
| Expand | Qwen 1 reference | 20.129 s | 20.6 GiB | 589,824 |
| Instruct | Qwen 2 references | 21.389 s | 21.5 GiB | 545,824 |

Compositor re-evaluation took approximately 155–305 ms per saved case. Model timings include differing load/cache/resolution conditions; sampled whole-GPU use is not precise model allocation. Fixture runs used 768², or 768×896 for top expansion. Other prompts, masks, aspect ratios and whole-image instructions are not established by this small visual set.

A separate real HTTP → durable job → worker → ComfyUI → collection run recoloured the orange sphere blue in 69.655 seconds including initial setup/queue overhead. Replay returned the same job. All 545,824 protected pixels and original bytes were unchanged. The working master's revision remained unchanged before review. Live browser comparison showed the original orange sphere and the proposed blue sphere with the protected bottle/label intact.

The live Accept click was blocked by automatic approval review because it commits the AI candidate into a working master and required specific user approval. No alternate route was used to accept that candidate. It remains ready for review in the final preview. Acceptance/conflict behaviour passed automated tests; manual live acceptance/reload is the remaining gate.

Local raw evidence remains ignored: data/edit-qa/runs.json and before/mask/raw/result PNGs; data/ai-edit-final/evidence/live.json and live-result.png. Screenshot: outputs/darkroom-ai-edit-review.png outside the source repository. The implementation signature, workflow hashes, engine fingerprint and scoped evidence ID are committed in workflows/edit-validation.json.

## KNOWN ISSUES

Manual selections determine protection boundaries. Leave context around objects and their shadows; a tight selection can truncate a replacement shadow or retain edge pixels. The background fixture retains a few manually selected silhouette-edge pixels that need refinement for delivery. Boundary matching is intentionally modest and cannot guarantee seamless joins for all photographs. No pixel-exact claim applies inside an allowed region or to a whole-image Instruct request.

Broad product/garment/person/artwork/restoration golden benchmarks remain pending. Selection is manual; Smart Select/SAM is not implied. Working-resolution resizing can change fine details inside the edit region. Complex/large masters are not broadly performance benchmarked. Prepared sources and raw results consume local storage and are retained rather than deleted automatically. Running jobs share the engine and cannot be globally interrupted safely; queued-job cancellation retains the existing backend boundary.

## GIT STATUS

Branch intelligent-edit, based on the unmerged edit-workspace branch. Logical commits separate requests/protection, validated task routing/recovery, evidence enablement and phase reporting. Published head and draft PR are recorded in the handoff. No main/legacy changes, merges, force pushes or destructive history operations.

## RECOMMENDATION

Review the six scoped edit actions and approve the synthetic live candidate's Accept click to finish the manual acceptance gate. Do not proceed to Phase 5 until that gate and this phase review are complete. The next phase is Finish; this implementation does not claim finishing/export capability.
