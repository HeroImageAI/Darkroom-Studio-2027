# Phase 7 — Exact branding preview

16 October 2026. User-authorised continuation from Composite. Review candidate stacked on `composite-workflow`; no merge or Phase 8 work.

## IMPLEMENTED

Branding remains inside Edit. “Add branding” adds editable single-line text, rectangles, ellipses and a restricted static SVG logo. Text controls offer bundled Regular/Bold fonts, size and colour. Shapes offer width, height, fill, no fill, stroke and stroke width. All use the existing position, scale, rotation, opacity, ordering, visibility, locking, duplicate, Undo/Redo, autosave and named-version mechanisms. Image/logo width and height can be entered in pixels while keeping current proportions; independent scale controls remain available.

The text renderer reads the pinned Inter Latin Regular/Bold WOFF glyphs and places their exact paths with pair kerning. The canvas requests those same paths from the local service. PNG/JPEG delivery and SVG handoff share those outlines. No OS font lookup, browser fallback or silent font substitution is used. Unsupported characters/fonts and multiline content fail explicitly. Text remains editable in the master/native project; SVG contains outlined text, not editable font text. This is deliberately limited Latin layout, not complex-script typography.

SVG import allows static paths, groups, nested SVG viewports, harmless title/description metadata and basic shapes with validated geometry, simple paint and transforms. Scripts, external references, images, fonts/text, declarations/DTDs, styles, gradients, clipping and effects are rejected with an error rather than stripped. Imported geometry is retained on the layer alongside an immutable PNG preview for the existing raster/AI document boundary. Unmasked SVG logos export as geometry; masked logos use their raster preview and are counted as raster. Fractional SVG viewports are scaled to match the canvas image viewport, with edge-pixel coverage tests.

Finish includes “Artwork & project handoff”. SVG keeps shapes/logos as vectors, outlines text, and explicitly reports embedded raster image count. Photos, paint and masked logos remain raster; SVG export does not claim vectorisation. PNG/JPEG exports now render visible supported branding through the outline renderer. Masters without visible text/SVG branding delegate to the unchanged earlier compositor.

A `.darkroom.json` file contains the current editable master, original source and referenced image/mask assets, including hidden layers and SVG geometry. Image hashes and font identities are checked before import, assets receive new IDs, and the file opens as a new project/master. Import does not overwrite existing projects. Earlier revisions, named-version history, briefs, jobs and export history are not bundled. Handoffs retain immutable revision, checksum and request identity in SQLite; retries use the same result. Import replay is persisted and concurrent same-key requests share one operation.

## NOT IMPLEMENTED

No arbitrary installed fonts, italics, paragraph layout, multiline text, complex shaping, advanced kerning controls, path/node editor, Boolean operations, tracing/vectorisation, CMYK/spot colour or professional print production. SVG support is a deliberately restricted subset, not arbitrary SVG interchange. Text in SVG is outlined; use the native project for editable text. Native files are single-master project copies, not full database backups.

Layered PSD is deferred: this phase provides genuine vector SVG handoff and editable native copies without claiming Photoshop/Affinity layer-format compatibility. No professional Affinity typography workflow was recreated. Phase 8 Library/recovery expansion is not started.

## TEST RESULTS

91 unit/integration tests pass, including glyph identity/no substitution, text outline coverage, geometry placement and PNG alpha, SVG/PNG pixel parity, malicious/unsupported SVG rejection, fractional logo viewport coverage, vector-only SVG reimport pixel parity, matched export/import size budgets, native editable round-trip, byte-exact source assets, identical rendered output, stale handoffs, retry conflicts, checksum rejection and concurrent import replay. Strict TypeScript and production build pass. Dependency installation reported zero audit vulnerabilities.

14 browser tests pass against the final running service. The new case edits text/font/size/colour, places/resizes a genuine SVG logo, sets shape coordinates, prepares an SVG, checks its actual paths and image pixels, reopens an editable native project as a separate copy, edits its text and verifies persistence after reload. Existing Create/Edit/Composite/Finish tests also pass. A browser-summary role selector was corrected after its first timeout; no timeout increase was used. Runtime testing also caught and fixed CommonJS font import compatibility. The initial font shaping route rejected an unsupported font table; the final supported Latin glyph layout is explicit and shared rather than substituting a font. CI status for the exact published head is recorded on the draft PR.

## LIVE RESULTS

The owned original Darkroom mark and a 900 × 560 geometric/text fixture were opened in the visible app. Title size was edited to 72, autosaved and exported through Finish to SVG, PNG and a native project copy. The native file was opened through the visible file chooser as a new project; all nine layers and the editable title/font/size/coordinates persisted. After reload, the imported project was reselected and reopened successfully.

[branding-qa.json](../workflows/branding-qa.json) records font/implementation hashes, source and copy IDs, delivery checksums and validation scope. SVG has zero embedded raster images and no font text. Its rasterised pixels are byte-identical to the matching PNG. The imported native master renders byte-identically to the source, and every referenced source image is byte-identical. The source revision stayed unchanged after export/import.

The actual exported SVG was opened in Affinity through the Windows file dialog. At 185% zoom the original logo, outlined DARKROOM/STUDIO 2027 text, tagline, rule and ellipse appeared in their expected positions, without a missing-font prompt. The file remains open. No existing Affinity document was modified or saved. This is scoped SVG opening/appearance evidence, not certification of arbitrary SVG or layered PSD compatibility. Native browser Save As was verified in Phase 5; this phase claims complete HTTP attachment bytes and actual Affinity SVG opening, not a repeated OS download test.

Final isolated preview is port **2048**, data root `data/branding-reviewed`. The final viewport fix re-exported byte-identical SVG/PNG files to the already reviewed fixture. The final service passed the full browser suite and retains a clean imported fixture for review. Earlier services/data remain untouched. Local raw evidence lives under ignored `data/branding-release/evidence`; screenshots and SVG/PNG/native samples are in `outputs/` outside the repository. No ComfyUI workflow/model changed, so no new GPU operation was needed or claimed.

## KNOWN ISSUES

- Two bundled font faces only, 1–512 px, up to 500 characters per single-line layer. Supported Latin/Latin-1 and common punctuation only; unsupported glyphs fail. Advanced typography belongs in Affinity.
- Visible editable text remains deliberately blocked from AI Edit and AI Finish by the existing renderer. Hide it before AI work, or export/open a raster copy. PNG/JPEG/SVG delivery supports it through the new deterministic renderer.
- SVG logos keep vector geometry only in their editable master/native file. The Library image is a labelled PNG preview; placing that preview alone does not restore vector metadata. Use “Import SVG logo” or the native project for vector retention. Masked logos are explicitly raster on SVG handoff.
- Handoff output is limited to 30 MB; native export and import both limit decoded images to 20 MB, so a successfully exported project fits the importer. Export verifies source checksums. The existing canvas renderer limit is 16 million pixels. Entire project history is not exported.
- Imports validate all contents before creating a new project. A disk failure during asset persistence can leave an incomplete new copy; existing projects remain intact. Automated cleanup is not introduced here.
- The app still defaults to the newest project on a fresh load. After another project is created, reselect the intended project to restore its last master. Broader Library/session behaviour belongs to later phases.

## GIT STATUS

Branch `branding-tools`, based on `composite-workflow` at `6a514ee262d4d949133ac99440e356d1cf6cc857`. Logical milestones cover branding/handoff implementation, fractional viewport correction, exact image dimensions, matched export/import budgets, vector-only SVG reimport, and this evidence/report. The implementation tree and published head are recorded on the draft PR; Windows/Linux checks must pass before merge. No force push, merge or legacy repository change.

Pinned additions: `@fontsource/inter` 5.3.0, `opentype.js` 2.0.0, `saxes` 6.0.0 and development typings. See [branding dependencies](BRANDING_DEPENDENCIES.md). No AI models or ComfyUI plugins were installed.

## RECOMMENDATION

Review this limited exact-branding preview. Text/logo coordinates, SVG raster/vector truthfulness, deterministic PNG delivery, native editable round-trip and the scoped Affinity opening check pass. Keep the font/SVG restrictions visible. Stop at this phase boundary; do not merge or begin Phase 8 automatically.

Initial implementation milestone: local commit 9aaab44b96d2a0ad4846ec5e8b582d6d7c29bcd7, tree f58b2cfe16367f5d4598676bf1ddc7c7af0316a7. The evidence/report follow in a separate commit; the exact published head is listed on the draft PR.
