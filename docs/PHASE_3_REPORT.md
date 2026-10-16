# Phase 3 — Edit foundation

16 October 2026. Review candidate stacked on the unmerged Create branch. No automatic merge or Phase 4 implementation.

## IMPLEMENTED

One SVG canvas renders the existing versioned document model with immutable raster assets. Layers have selection, rename, visibility, lock, opacity, duplication, recoverable removal through Undo, and forward/backward ordering. Move supports pointer dragging; numeric X/Y, independent width/height scale and rotation provide exact transforms. Pan, zoom presets and Fit are available. The original starts locked; users can duplicate it to make an independent working layer.

Mask brushing hides or reveals pixels through editable layer-local strokes, including inverse mapping through rotated/scaled layers. Rectangle and lasso selections are visible and stored in document coordinates. Crop changes the viewport and translates layers without discarding source pixels or mask data. Undo/Redo covers document commands and gestures, with up to 50 in-session states. Escape cancels a pointer gesture. Keyboard shortcuts leave text/number inputs to normal editing.

The master autosaves after an editing pause and shows its save state. Browser recovery retains unsaved commands when a request fails; reload presents an explicit restore choice. A competing revision blocks further saving and offers a separate master or the saved copy. Saving a named version checks the expected revision. Reopening a recent image uses its latest master; the Edit destination remembers the last master per project. Camera EXIF rotation is reflected in new import dimensions while preserving original bytes.

No new runtime dependencies or database migration. Additive optional mask/selection fields keep old schema-version-1 masters readable. Input limits cap layers at 100, strokes at 500 per layer, points at 2,000 per stroke and total editable mask/selection points at 20,000. The API continues validating project ownership and immutable revisions.

## NOT IMPLEMENTED

AI selection/SAM, natural-language edits, removal/replacement/recolour/background/expand workflows, painting/compositing new sources into an existing master, text/logo creation tools, vector editing, layer groups, finishing/export suite and full Library/version browsing. These remain in their planned phases. Selections are saved outlines, not yet AI execution masks. This phase does not generate a new AI image.

## TEST RESULTS

54 unit/integration tests passed, strict TypeScript and production build passed. Nine Chromium browser tests passed against the fresh final service. Four browser cases exercise the real editor/API/SQLite, without mocked document saves: transforms, visible masked pixels, mask Undo/Redo, crop, selection, named version, original integrity, reload, conflicting writes, separate-master recovery, failed-save browser recovery, keyboard history and narrow layout. Existing foundation/Create cases still pass; the Create model-result cases remain explicitly mocked fixtures.

Store tests reopen SQLite and recover exact transform/mask/selection revisions, retain source bytes, reject stale writes/versions and verify EXIF-oriented imports. Geometry tests check inverse rotation/scaling and non-destructive crop. Browser pixel checks inspect the checkerboard where red fixture pixels were masked. CI results are reported separately in the handoff/PR.

## LIVE RESULTS

The owned NOIR bottle fixture was imported into an isolated final preview, duplicated to Product study, moved to X30/Y55, scaled to 0.92 on both axes and rotated −4 degrees. Original visibility was disabled while retaining its locked source layer. A background strip was deliberately masked; Undo removed it and Redo restored the same stroke. A named version was saved. Reload reopened the masked/transformed master with All changes saved. The original bytes were verified against the owned source SHA-256.

Manual review found a deferred React history-updater bug after the initial tests; Undo/Redo now captures the current snapshot before scheduling updates. The mask-specific browser regression and the live sequence passed after the fix. Layout was adjusted so the full fitted canvas remains visible beside scrollable layer/property panels on the review viewport.

Raw local evidence remains ignored: data/edit-final/evidence/manual-review.json. The user-facing screenshot is outputs/darkroom-edit-canvas.png outside the source repository. No new model benchmark or AI-edit success is claimed; Create's previous model limitations remain unchanged.

## KNOWN ISSUES

Undo history is in-session; reload restores the saved editable master rather than historical Undo steps. Masks use hard round brushes with hide/reveal and no feather/pressure. Selections currently support rectangle/lasso and clearing, not add/subtract or smart selection. Transforms use numeric scale/rotation and drag movement rather than bounding-box handles. Crop cannot expand the image. Large documents/long mask histories are bounded but not yet broadly performance benchmarked. Older already-imported camera images retain their prior metadata; the orientation correction applies to new imports.

On narrow screens the layer/property controls flow below the canvas. Desktop remains the primary editing target. Named versions are stored with revisions; a full version browser/restore UI remains later Library work. PNG/JPEG/native/PSD delivery export is not implied by the live SVG renderer.

## GIT STATUS

Branch edit-workspace, stacked on create-workspace because preceding PRs remain open. Logical commits separate the canvas, recovery/validation and final live history review. Published head and draft PR are recorded in the handoff. No merge, force push, main change or legacy repository modification.

## RECOMMENDATION

Review this manual editing foundation and its explicit limits before Phase 4. The next authorised phase would connect visible selection → instruction → reviewed AI result, keeping current masters and protected source pixels intact.
