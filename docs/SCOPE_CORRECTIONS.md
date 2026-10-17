# Core scope corrections — 17 October 2026

This is corrective work after the Phase 7 preview, not Phase 8. Create / Edit / Library remain the only destinations. Library expansion stays on hold until the remaining core outcome gates are reviewed.

## Implemented

- Smart Select uses the existing validated BiRefNet foreground mask for clicks and the already installed SAM 3.1 checkpoint for object descriptions. Add/Subtract combines selections; Rectangle, Lasso and a selection brush refine them. Masks retain holes and disconnected regions. No model, plugin or runtime dependency was installed.
- Selection masks are revision-owned assets, survive save/reload and native project handoff, and participate in AI Edit and protected Restore. Crop and accepted AI results clear obsolete selection coordinates. Selecting never changes source-image pixels.
- AI preparation and PNG delivery share exact bundled glyph/SVG rendering. Visible supported text no longer needs to be hidden before AI work. AI proposals remain raster results; source editable layers are retained by the existing review/history workflow.
- The primary toolbar shows Move, Select, Crop and Smart Select. Less-used tools and selection refinement sit under More tools. Composite harmonisation is collapsed until requested. The restricted restoration action is labelled **Restore surroundings**.
- Recolour no longer matches its selected boundary back to the old colour or fades the old colour inward. Other edit protection remains unchanged. Protected pixels remain byte-exact.
- Validation signatures pin the loaded implementation and the shared rendering/font inputs; a running older implementation cannot adopt a newer on-disk signature.

## Not implemented or not certified

General identity-preserving restoration, arbitrary click-object segmentation, reliable small-part language selection, clear-glass/translucent matting, professional artwork perspective extraction, and broad commercial photographic fidelity remain open outcomes. No advanced typography/vector editor, DAM, video, 3D or Library expansion was added. Existing stacked draft PRs still need human review and integration; nothing was merged.

## Automated checks

100 unit/integration tests pass, including selection holes, component isolation, Add/Subtract, brush dabs, stale revisions, project ownership, native mask round-trip, crop invalidation, branded AI input parity, protected Restore masks and the recolour boundary regression. TypeScript and production build pass. Twelve baseline rendering/retained-GPU-output parity comparisons pass.

The browser suite now contains 15 tests. Local headless browser startup failed before reaching the app (missing bundled Chromium and Edge process startup restrictions). This is not a browser-suite pass. The updated suite must pass CI before this work is considered merge-ready.

## Real AI and visual checks

Seven additional GPU cases cover the six previously unfilled categories. See [photo evidence](../workflows/photo-corrections-qa.json) and the [golden catalogue](../tests/golden/catalog.json). Inputs are public-domain/CC0 photographs and an owned chair sketch, with pinned hashes and rights links in [photo sources](../tests/golden/photo-sources.json).

- Person: neutral background replacement; 140,114 protected subject pixels exact. Scoped visual pass; delivery edges still need review.
- Garment: the initial manual polygon produced a visibly partial sleeve patch and failed. A SAM suit mask plus the corrected recolour compositor produces navy fabric with folds and protected face/patches retained; 203,241 pixels outside the allowed region are exact. Fine mask edges and seams still need refinement, so this remains partial rather than a general garment gate pass.
- Environment: upward sky expansion; all 175,104 original pixels exact. Scoped visual pass.
- Sketch: one blue chair follows the owned sketch's structure/view. Scoped visual pass; whole-image interpretation has no exact-pixel guarantee.
- Low-quality portrait: protected head retains its degraded source quality. Surrounding repair is partial evidence, not general restoration certification.
- Dark glass: useful bottle silhouette and original RGB, but true clear/translucent-glass matting is not established. Partial.

SAM checks cover person, bottle and spacesuit descriptions. A short sleeve description selected an incomplete area and failed its intended target. Native SAM point decoding also failed the checks and is deliberately unused. Clicking uses the separately checked BiRefNet foreground-component route. Every result is a visible, refinable selection proposal.

## Live UI checks

The corrected preview uses isolated test data at http://127.0.0.1:2056/. A live SAM suit selection with visible editable text saved successfully. Clear selection → Undo restored the same mask asset; reload reopened that same mask and the visible editable title. A real branded AI recolour job also succeeded with text visible: all 203,312 protected pixels were byte-exact, including the title region, and the working master revision stayed unchanged. The candidate was not accepted. See [live evidence](../workflows/live-corrections-qa.json). Existing user masters and older previews are retained.

## Remaining risks

Masks determine protection boundaries; automatic segmentation is not guaranteed to follow every edge or small part. Accepted full-image AI results use the existing raster-result workflow, retaining prior source layers rather than promising a fully live vector/AI composition. First engine/model verification can take substantially longer than warm segmentation. Derived masks, paint strokes and raw candidates still accumulate storage.

## Next step and scope gate

Keep Phase 8 on hold. Review these corrections and the CI/browser results, then close the partial photographic outcomes with representative real work. Do not count a successful engine call, a synthetic fixture, or a limited Restore workaround as a completed general outcome gate. Keep branding at its current basic scope and integrate the reviewed draft stack before expanding the product.
