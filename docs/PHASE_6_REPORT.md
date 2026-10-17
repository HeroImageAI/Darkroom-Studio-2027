# Phase 6 — Composite preview

16 October 2026. User-authorised continuation from the validated Finish preview. Review candidate stacked on `finish-workflow`; no merge or Phase 7 work.

## IMPLEMENTED

Compositing stays in Edit. “Add to this canvas” places an existing project image or imports a PNG/JPEG/WebP as another image layer without replacing the current master. Placement preserves aspect ratio and alpha, fits the asset within 80% of the canvas and centres it. Existing position, scale, rotation, opacity, mask, visibility and ordering controls remain available. Imported transparent cutouts and saved background-removal results can be placed through the same controls.

Paint and Erase provide rough guidance on separate raster paint layers. Users choose colour and brush size, add strokes to an unlocked paint layer or start another one. Each stroke creates immutable PNG bytes; the normal document history provides Undo/Redo, autosave, recovery and version retention. Erasing removes paint alpha, not source pixels. Requests validate the saved revision, paint-layer identity/lock, colour, stroke bounds and 16-million-pixel limit. A stale request cannot silently replace a newer master. Paint preparation has a visible save state. New imports are scoped to the current project and document.

“Harmonise composite” proposes an editable instruction using the existing validated Qwen Instruct route, with the selected subject protected and only its surroundings editable. It requires a visible selection and the existing enabled Instruct capability. The user reviews the instruction before Apply and compares the proposed image before accepting, rejecting or retaining a separate version. The source is a frozen render of visible image, mask and paint layers. Protected pixels use the existing exact compositor. No new engine graph, rendering algorithm, model or runtime dependency was added; earlier edit/Finish validation signatures remain intact.

## NOT IMPLEMENTED

No separate Compose destination, general painting suite, grouping, automatic object-boundary selection, dedicated relighting model, editable brush stroke objects or layered Affinity interchange. Paint is stored as immutable raster revisions, with per-stroke undo during the current editing session. Persistent named versions retain meaningful states. Phase 7 text/logo/vector authoring and Phase 8 Library expansion remain outside this change.

## TEST RESULTS

83 unit/integration tests pass. New real SQLite/image tests cover paint colour/alpha, transparent surroundings, erasing, immutable prior paint/source assets, rendering, stale revision rejection, invalid stroke input and layer restrictions. Strict TypeScript and production build pass.

13 browser tests pass. The new case places a transparent cutout, transforms it, paints and erases on a separate layer, inspects actual saved alpha/pixels, undoes and waits for persisted revision equality, chooses the protected harmonisation preset and reopens the layered master. Existing Create/Edit/Finish browser tests also pass. The first run exposed a paint-preparation save-status problem; this was fixed. A later assertion was corrected to wait for Undo's asynchronous autosave rather than inspect the previous revision immediately. CI status for the published head is recorded on the draft PR.

## LIVE RESULTS

Real HTTP → durable queue → ComfyUI Desktop 0.41.2 on RTX 3090, Qwen two-reference Instruct route at 768². The fixture combines an owned synthetic studio background, a separately imported transparent NOIR product and a rough painted shadow. [composite-qa.json](../workflows/composite-qa.json) retains both outcomes and provenance hashes:

| Case | Time including submission/collection | Outcome |
| --- | --- | --- |
| Broad protected rectangle | 30.583 s | Failed visual review: rectangle retained rough paint/background and created a visible boxed shadow; not accepted |
| Close subject selection | 24.313 s | Scoped visual pass: coherent surrounding surface/contact shadow; label and protected product unchanged; no boxed shadow |

The successful run retained 105,654 protected RGBA pixels exactly and changed 484,058 allowed pixels. Source bytes and the working revision remained unchanged before review. The protected product deliberately retains its original appearance rather than being relit. These are illustrative product-fixture checks, not general photograph, person, garment or commercial fidelity certification. Cold/warm state and peak VRAM were not separately measured; no performance promise is made.

Through the visible app, Keep as separate version retained master `368463e6-45f3-41e3-978d-5f1a4bb15fd2`, version `9e17d7cd-f9ea-4526-8789-dc7cf792e22f`. Original image/cutout/paint layers remain hidden in the new master and intact in the source master. Reloading and reopening Edit retained the saved result. A 768² PNG delivery was prepared through the UI; complete attachment bytes match export SHA-256 `5303c6f3bb41636b39be82931fee006c054ab8845dc1932228aac40ced8c2aad`. The prior Phase 5 native browser/Affinity handoff is unchanged; this phase does not claim a second native Save As or Affinity validation.

Current isolated preview: port 2044, `data/composite-live`. Local evidence is ignored under that directory; screenshot and PNG delivery are supplied in `outputs/` outside the repo. Earlier services and user masters remain untouched. Port 2043 was started before network permission was granted and did not respond to validation; it is not the advertised preview.

## KNOWN ISSUES

- Selection quality matters. A broad rectangle can preserve unwanted background or paint, as the failed QA case demonstrates. Use a close lasso and review joins before accepting. Automatic subject segmentation remains outside this phase.
- Protection means no change inside the selected region. It cannot simultaneously preserve exact product pixels and relight those same pixels. Harmonisation currently improves surroundings, shadows and joins.
- Rough paint is synchronous per stroke and creates an immutable image asset for each completed stroke. Project storage can grow; no cleanup/deletion was added. The lightweight Library labels both manual and AI generated images as “Created image”.
- Canvas rendering retains the 16-million-pixel limit and the existing AI working-size limits. Visible text layers still fail explicitly until the dedicated typography renderer is validated.
- The global file-drop/import behaviour is unchanged; use “Import as layer” to place into an existing composition.

## GIT STATUS

Branch `composite-workflow`, based on `finish-workflow` at `90ff0c08444ac17a95844b0f7a04f0c9899ca689`. Implementation local milestone `e9f2e88f683573715ce5adc9a9a57a3bc478f962`, tree `f65043f43243e3048c348f522b45c61558fa2b70`. Evidence/report are a separate logical milestone. The published head and Windows/Linux checks are recorded on the draft PR. No force push, merge, legacy-repository change or dependency/model installation.

## RECOMMENDATION

Review this scoped Composite preview. The manual composition, protected candidate review and owned-product visual checks pass with the close-selection restriction above. Keep the broad-selection failure visible in evidence. Stop at this phase boundary for user review; do not begin Phase 7 automatically.
