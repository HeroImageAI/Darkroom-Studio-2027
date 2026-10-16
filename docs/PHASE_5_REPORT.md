# Phase 5 — Finish preview

16 October 2026. Review candidate stacked on Intelligent Edit. **Gate held:** Restore failed lettering fidelity, and native browser saving/Affinity opening remain unverified. No merge or Phase 6 work.

## IMPLEMENTED

Finish is a compact disclosure inside Edit. Crop reuses the existing non-destructive canvas tool. Local background removal uses the installed BiRefNet model; AI Upscale uses the installed SeedVR2 model with tiled VAE encode/decode, one Euler step and LAB colour correction. Upscale offers 2×, 4× and an Advanced custom width with proportional height. Current AI bounds are 256–2048 pixels per side and 4,194,304 pixels total. A large source may therefore exceed the supported 2×/4× size; the UI disables that request and explains the bounds.

Jobs use the existing persisted, leased, serial GPU queue. Sources and base revisions are frozen. Submission retries reuse the original request, recovery collects acknowledged engine completions, and uncertain submissions are not blindly retried. Provenance includes the compiled graph, execution hash, source hash, base revision, exact model hashes, engine identity and validation evidence. Engine version, node schema, processing implementation and model contents must match the local validation record before execution.

Background removal multiplies the existing alpha plane by a soft foreground mask while preserving every RGB byte. Upscaling applies the engine RGB result while restoring the separately resized source alpha. Model completion does not change the master. Users compare before/result, accept, reject, or save a separate master. Acceptance checks the base revision and retains hidden prior layers plus a named version. Accepted output is made available to the canvas asset list; proposals and export internals stay out of ordinary Library cards.

PNG/JPEG exports render the visible saved layers, transforms and masks. Delivery size supports original, 2×, 4× and custom dimensions; this export resizing is explicitly Lanczos interpolation, separate from AI Upscale. PNG can preserve existing alpha or flatten onto a chosen background. JPEG requires explicit flattening, uses 4:4:4 chroma and adjustable quality. Both embed an sRGB profile and selected print-density metadata. Export records retain immutable source revision, format, dimensions and SHA-256; retries are idempotent and changing masters are guarded. Filenames are unique; prior files and the master are retained. Local attachment routes enforce the existing Host/Origin protections.

## NOT IMPLEMENTED

Restore is visible but disabled. The installed SeedVR2 workflow changed fine label text on both 384² and 768² restoration tests. Neither a successful engine response nor a sharp-looking bottle was accepted as fidelity validation. No alternative restoration workflow has been validated. Native Affinity handoff, layered interchange and vector delivery are not claimed. Phase 6 compositing/paint, Phase 7 branding creation and the full Phase 8 Library remain outside this change. No models, plugins or runtime dependencies were installed.

## TEST RESULTS

79 unit/integration tests pass, including real SQLite migrations, export bytes/profile/density/dimensions/alpha, explicit JPEG background, immutable revision provenance, idempotent reopen/retry, stale-master guards, review/version preservation, accepted-asset visibility, shared worker dispatch/recovery, source RGB preservation, resized alpha, rejected results and validation pinning. Strict TypeScript and production build pass.

The browser suite contains twelve tests. The Finish case uses real storage and renders actual attachment bytes; it checks download initiation, PNG/JPEG dimensions and alpha, unchanged source/master, and delivery history after reopening. Model completion in the existing AI browser cases is explicitly mocked. Real GPU evidence is separate below. The headless browser cancels native saves in this environment, so the test intentionally verifies initiation plus the served attachment payload rather than claiming a saved OS file. CI results are reported on the draft PR.

## LIVE RESULTS

Five direct engine QA renders were visually reviewed; hashes, node/template evidence and timing scope are in [finish-qa.json](../workflows/finish-qa.json). Models are pinned in [finish-validation.json](../workflows/finish-validation.json). ComfyUI Desktop 0.41.2, RTX 3090:

| Case | Output | Submission-to-collection | Outcome |
| --- | --- | --- | --- |
| BiRefNet background removal | 384² | 2.322 s | Scoped pass; checked on a contrasting blue background |
| SeedVR2 restore | 384² | 7.200 s | Failed fine lettering |
| SeedVR2 2× upscale | 768² | 2.434 s | Scoped pass; NOIR and small label readable |
| SeedVR2 4× upscale | 1536² | 4.306 s | Scoped pass; readable label, some surface/detail changes |
| SeedVR2 restore | 768² | 2.114 s | Failed lettering; EAU changed toward CAU |

These are one owned synthetic product fixture, not general person/product/design fidelity certification. Cold/warm states and peak VRAM were not separately measured. There is no speed promise.

The final real HTTP → queue → worker → engine background-removal check completed in 75.740 s including initial verification/queue overhead. Job `23a2f4b1-d607-4328-a776-e77e2f944c5d`, source master `73c9df25-f860-4116-b08b-2dbc51086031`. Pixel checks confirmed transparent background and near-opaque foreground; original bytes and base revision stayed unchanged before review. Through the visible UI, Keep as separate master produced `8514b2be-71aa-474d-8820-aebe004a991d` and named version `3343fbc1-2b63-43ca-b4ba-5aa0802b05ea`. The cutout was visually verified on the checkerboard after fixing accepted-output visibility. PNG and white-background JPEG delivery files were prepared through the UI and independently decoded from stored bytes; both are 384², with PNG alpha and no JPEG alpha. The original working master remains unchanged.

Local raw evidence is ignored under `data/finish-qa` and `data/finish-release/evidence`; screenshots and two delivery samples are supplied outside the repository in `outputs/`. The live preview is on port 2041. Earlier isolated services and the user's existing masters were retained.

## KNOWN ISSUES

- Restore is unavailable until a local workflow passes identity/design/lettering review.
- Native browser saving was cancelled by the headless browser; the cause is not established. Download initiation, attachment headers and complete image payloads pass. A native save and Affinity open must still be checked.
- AI Upscale changes texture and small details. The scoped fixture passes do not guarantee exact lettering, faces or commercial design fidelity. Transparent AI-upscale alpha handling has deterministic tests; diverse translucent/hair-edge GPU cases remain unvalidated.
- Source rendering shares the current 16-million-pixel compositor limit. Export output is at most 40 million pixels/16384 per side, with the existing 30 MB stored-asset limit. Visible editable text layers and unsupported vector colours fail explicitly; no silent font substitution.
- Custom export width and height can distort the aspect ratio; the UI warns. AI Upscale preserves the aspect ratio. sRGB raster export is supported; CMYK/spot colour and layered Affinity interchange are not.

## GIT STATUS

Branch `finish-workflow`, based on `intelligent-edit`; draft review only. Earlier PRs remain unmerged. Runtime assets, browsers and raw evidence are ignored. No force push or legacy-repository changes.

## RECOMMENDATION

Review this Finish preview, but hold the Phase 5 gate. Resolve Restore fidelity and complete native save/Affinity validation before calling Finish complete. Do not start Phase 6 automatically.
