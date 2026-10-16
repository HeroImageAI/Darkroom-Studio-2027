# Phase 5 — Finish preview

16 October 2026. Review candidate stacked on Intelligent Edit. **Protected Restore follow-up validated:** mandatory preserved selection, native browser download and Affinity raster handoff now pass the scoped checks below. Draft review only; no merge or Phase 6 work.

## IMPLEMENTED

Finish is a compact disclosure inside Edit. Crop reuses the existing non-destructive canvas tool. Local background removal uses the installed BiRefNet model; AI Upscale uses the installed SeedVR2 model with tiled VAE encode/decode, one Euler step and LAB colour correction. Upscale offers 2×, 4× and an Advanced custom width with proportional height. Current AI bounds are 256–2048 pixels per side and 4,194,304 pixels total. A large source may therefore exceed the supported 2×/4× size; the UI disables that request and explains the bounds.

Jobs use the existing persisted, leased, serial GPU queue. Sources and base revisions are frozen. Submission retries reuse the original request, recovery collects acknowledged engine completions, and uncertain submissions are not blindly retried. Provenance includes the compiled graph, execution hash, source hash, base revision, exact model hashes, engine identity and validation evidence. Engine version, node schema, processing implementation and model contents must match the local validation record before execution.

Background removal multiplies the existing alpha plane by a soft foreground mask while preserving every RGB byte. Upscaling applies the engine RGB result while restoring the separately resized source alpha. Model completion does not change the master. Users compare before/result, accept, reject, or save a separate master. Acceptance checks the base revision and retains hidden prior layers plus a named version. Accepted output is made available to the canvas asset list; proposals and export internals stay out of ordinary Library cards.

PNG/JPEG exports render the visible saved layers, transforms and masks. Delivery size supports original, 2×, 4× and custom dimensions; this export resizing is explicitly Lanczos interpolation, separate from AI Upscale. PNG can preserve existing alpha or flatten onto a chosen background. JPEG requires explicit flattening, uses 4:4:4 chroma and adjustable quality. Both embed an sRGB profile and selected print-density metadata. Export records retain immutable source revision, format, dimensions and SHA-256; retries are idempotent and changing masters are guarded. Filenames are unique; prior files and the master are retained. Local attachment routes enforce the existing Host/Origin protections.

## NOT IMPLEMENTED

Unrestricted Restore remains unavailable: the installed SeedVR2 workflow changed fine label text in the original tests. Protected Restore requires a saved selection around lettering, logos or other details to retain. Those details keep their source quality; only the surrounding image is restored. Layered interchange and vector delivery are not implemented. Phase 6 compositing/paint, Phase 7 branding creation and the full Phase 8 Library remain outside this change. No models, plugins or runtime dependencies were installed.

## TEST RESULTS

81 unit/integration tests pass, including real SQLite migrations, export bytes/profile/density/dimensions/alpha, explicit JPEG background, immutable revision provenance, idempotent reopen/retry, stale-master guards, review/version preservation, accepted-asset visibility, shared worker dispatch/recovery, source RGB preservation, resized alpha, rejected results and validation pinning. Strict TypeScript and production build pass.

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

Local raw evidence is ignored under `data/finish-qa` and `data/finish-release/evidence`; screenshots and two delivery samples are supplied outside the repository in `outputs/`. The current protected Restore preview is on port 2042. Earlier isolated services and the user's existing masters were retained.

## KNOWN ISSUES

- Restore requires a protected selection and supports sources up to 1024 pixels per side. General identity/design fidelity outside that selection is not certified.
- Automated headless saves still cancel in this environment. The real in-app browser successfully saved the restored PNG to Windows Downloads; its SHA-256 exactly matches the immutable export record. Actual Affinity PNG/JPEG opening also passed.
- AI Upscale changes texture and small details. The scoped fixture passes do not guarantee exact lettering, faces or commercial design fidelity. Transparent AI-upscale alpha handling has deterministic tests; diverse translucent/hair-edge GPU cases remain unvalidated.
- Source rendering shares the current 16-million-pixel compositor limit. Export output is at most 40 million pixels/16384 per side, with the existing 30 MB stored-asset limit. Visible editable text layers and unsupported vector colours fail explicitly; no silent font substitution.
- Custom export width and height can distort the aspect ratio; the UI warns. AI Upscale preserves the aspect ratio. sRGB raster export is supported; CMYK/spot colour and layered Affinity interchange are not.

## GIT STATUS

Branch `finish-workflow`, based on `intelligent-edit`; draft review only. Earlier PRs remain unmerged. Runtime assets, browsers and raw evidence are ignored. No force push or legacy-repository changes.

## RECOMMENDATION

Review the protected Finish preview and its scoped evidence. The prior Restore and native handoff blockers are addressed within the restrictions documented here. Phase progression still requires user review; do not merge or start Phase 6 automatically.

## PROTECTED RESTORE FOLLOW-UP

Restore works at 2× resolution and delivers the original dimensions. The saved selection is frozen with the source revision; protected RGBA pixels are copied exactly, source alpha is preserved everywhere, and the transition is feathered outside the selection. Missing selections and sources above 1024 pixels per side are rejected. Runtime validation is tied to the loaded implementation, engine schema and installed model hashes in [finish-validation-v2.json](../workflows/finish-validation-v2.json). The earlier evidence is retained as history.

Three real GPU cases passed scoped visual review: clean 384² (2.209 s), clean 768² (4.429 s), and degraded 384² (2.175 s). Respectively 9,476, 37,904 and 9,476 protected pixels were byte-exact. All alpha was preserved. Earlier background-removal and upscale outputs recomposed byte-identically. Evidence: [restore-qa.json](../workflows/restore-qa.json). Run the dedicated scripts/validate-restoration.ts utility for protected Restore; validate-finish.ts now covers background removal and upscale only.

The full HTTP/queue/engine Restore case completed in 63.570 s including cold verification. Job `ad7a5f29-25d1-428e-8388-c00d0a4d003e` was kept through the visible UI as separate master `d46b4db3-939d-43b0-9e9d-84ca09fb84b3`, version `06938724-70da-4b45-8032-7e37b80f67de`; the original revision remained unchanged. Reloading and reopening Edit retained the new master. Its 384² PNG export `b554718e-4ba2-4ede-abcb-3dd5e71aff96` was prepared and downloaded through the in-app browser to Windows Downloads. The saved file matches export SHA-256 `4ef9fa31cd148dce492f2d9259e6428679628a1b5a8d5868a55904ed80c4fd35`, including 300 dpi metadata. The browser tool returned the saved path after a long wait; no speed claim is made.

Affinity opened the actual earlier transparent PNG and white-background JPEG delivery files. Checkerboard transparency and white flattening were visually checked; the JPEG showed 384 × 384 at 300 dpi. Screenshots and restored delivery PNG are provided in outputs outside the repository. Native raster handoff is verified; editable/layered Affinity interchange is not claimed.
