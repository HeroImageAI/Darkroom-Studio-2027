# Artwork perspective correction

17 October 2026. Original-brief section 20 milestone, inside Edit → Finish. This implements reviewed planar perspective correction; it does not certify the full artwork-extraction quality gate.

## Implemented

Straighten artwork lets the user mark four visible corners, drag numbered markers, or enter coordinates with the keyboard. Output width/height provide known design proportions; the edge-based starting size is explicitly an estimate. Invalid, reversed, crossing, collapsed and out-of-source outlines fail before a preview is persisted. Output is bounded to 2–8192 pixels per side and 16 million pixels, within the existing image storage budget.

The service renders the frozen saved master with the same exact text/logo renderer used for delivery. A projective inverse mapping resamples the selected quadrilateral into a rectangle. Bilinear colour interpolation uses premultiplied alpha, then returns straight RGBA; transparent-edge colour does not leak from invisible pixels. No model, prompt rewriting, image reconstruction, new package or ComfyUI configuration is involved. The geometric basis is the [OpenCV homography explanation](https://github.com/opencv/opencv/blob/4.x/doc/tutorials/features2d/homography/homography.markdown?plain=1); the bounded implementation is local TypeScript, not an OpenCV dependency.

Previews are immutable internal assets with persisted source revision, corners, dimensions, source/output hashes and idempotency key. They never change the master. The user can review/reject a preview or save a separate editable master. Saving verifies the preview hash, retains the original asset and all prior layers hidden in the copy, and creates a named version. Concurrent/repeated requests resolve to one preview record and repeated save requests to one master. Previous previews remain selectable after reload rather than being silently truncated from the interface.

## Selected-artwork isolation

Keep selected artwork only is an opt-in setting using the existing visible selection. The saved selection multiplies source alpha before perspective sampling; selected RGB is retained. Missing, empty and non-overlapping selections fail clearly. The record pins the canonical selection-mask hash. Saving produces an Isolated artwork raster layer in a separate master, retaining the hidden locked original. Omitted settings preserve older persisted retry requests; no migration or engine change is needed.

One pinned NASA photograph was manually outlined around its small badge. The isolated 84 × 83 result retained all 4,411 selected RGBA pixels exactly and made 2,561 surrounding pixels transparent. The live preview produced the same output hash, saved a separate master and reopened after reload. Original bytes and revision stayed unchanged. Visual review shows source-resolution softness, a jagged manual boundary and a small orange fringe. This is a scoped functional pass with partial edge quality, not certification of automatic extraction, readable reconstructed lettering or curved-fabric repair.

Three integration cases cover holes/disconnected regions, source alpha, invalid selections and legacy retries. A browser case exercises actual canvas selection and checks real PNG alpha/RGB. Its cross-platform CI result must be verified separately. Reproduce with `node --import tsx scripts/validate-artwork-isolation.ts`; live seeding/measurement requires an explicit `DR_DATA_DIR`. Evidence: `workflows/artwork-isolation-validation.json` and fixture-specific `tests/golden/artwork-selection.json`.

## Verification

- 118 unit/integration tests pass locally; strict TypeScript and production build pass. Eight new tests cover independent projective geometry, identity pixels including hidden RGB, premultiplied edge interpolation, invalid geometry/limits, immutable originals, native editable round-trip, concurrent retries, stale requests, rejection and damaged-preview refusal.
- A new browser case checks coordinate editing, real preview bytes/dimensions, pending-preview recovery after reload, separate-master saving and reopening. Its Windows/Linux CI result is reported on the PR, separately from the live browser checks below.
- An owned 400 × 240 design with DARKROOM / STUDIO 2027 lettering was projected into a 480 × 300 source using an explicit independent matrix. Rectification recovers its framing and readable design. Interior RGB MAE is 3.906/255 after two resampling stages; this supports this controlled fixture only. Small edge sampling artifacts remain visible at the outer card boundary.
- Live preview 2058: four-point clicking and dragging were checked. A clean fixture used the accessible coordinate fields and exact intended proportions, then Preview → Save as new master. The source revision and original bytes stayed unchanged. Reload reopened the 400 × 240 copy with the original hidden/locked layer retained. Its output SHA-256 matches the separately controlled result.
- A single 16-million-pixel calculation took 856.59 ms with approximately 156.7 MB process RSS on this workstation. This excludes image rendering, PNG encoding and storage; it is not a full-request, cold/warm or cross-machine benchmark.

Evidence: `workflows/artwork-validation.json`. Local owned fixture files and measured reports live under ignored `data/artwork-qa/`. Reproduce the controlled case with `node --import tsx scripts/validate-artwork.ts`. Explicit `--seed-preview` / `--measure-live` require `DR_DATA_DIR` to name the isolated preview workspace. No existing project is overwritten by fixture seeding.

## Still open

Real photographed designs, fabric folds/curvature, lens distortion, noise cleanup, minor missing-detail repair, and isolation from a complex printed background still need representative evidence and appropriate corrections. A planar transform cannot undo curved fabric. Resampling cannot recover missing resolution. Existing alpha is retained/interpolated; an opaque shirt photograph needs an explicit selection for transparent isolation. Selection quality and foreground edge colour still require review. The output is labelled raster and may be finished with existing selection/mask/upscale tools before export. No tracing or true vectorisation is claimed.

Library expansion remains behind the core quality gates. The original Klein/Qwen/SeedVR2 production routes are unchanged.
