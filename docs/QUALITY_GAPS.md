# Quality follow-up

The approved core corrections were merged through PR #8 into `composite-workflow` at `5166a47`. This follow-up stays within the existing editing tools. Library expansion remains on hold.

## Recolour transparency correction

Recolour now retains the frozen source alpha channel. RGB-only engine output cannot make translucent cutout edges opaque, and an engine-generated alpha channel cannot make an opaque original translucent. Fully transparent source pixels retain all four original bytes. Other editing actions keep their existing opacity behaviour.

`scripts/check-recolour-alpha.ts` compares the six retained GPU edit outputs against the merged implementation. All six retain RGB parity; the five other actions retain complete RGBA parity. Recolour corrects 13,449 alpha differences in the retained opaque fixture. A separate owned alpha-ramp fixture checks all 589,824 alpha values, 545,824 protected or empty pixels, and confirms 43,998 selected pixels change colour. Results are in `workflows/recolour-alpha-validation.json`.

Run `node --import tsx scripts/check-recolour-alpha.ts` after preparing the retained local `data/edit-qa` fixtures. It generates a temporary baseline module from the pinned merge commit and removes it on completion. Public source images and local GPU outputs are not committed.

## Selection refinement comparison

`scripts/check-selection-refinement.ts` ran nine local GPU cases: garment, full person and product, each with zero, one and two native SAM refinement iterations. One iteration adds 227 garment pixels; two add 209. The changes do not resolve the existing seam/zipper omissions. Full-person refinement also fills pixels inside a badge, so a larger mask is not sufficient evidence of better accuracy.

The comparison is recorded in `workflows/selection-refinement-comparison.json`. It is **not enabled** and does not change the existing selection validation gate. Cyan pixels in the generated `.changes.png` files show additions; magenta shows removals. This diagnostic never edits a user's master.

## Still open

- Garment edges, seams and accurate small-part selection need stronger photographic evidence and corrections.
- Identity-preserving restoration remains limited to surroundings; protected degraded facial detail is not repaired.
- Clear/translucent glass extraction remains unproven. Preserving existing alpha is separate from recovering a glass matte.
- Professional artwork perspective extraction and broader photographic QA remain open.

No new product controls or model downloads are introduced by this follow-up.

## Garment description follow-up

Six descriptions were compared on the same public-domain portrait using the unchanged enabled SAM graph: orange fabric, orange clothing, orange suit, spacesuit fabric, left arm sleeve and right arm sleeve. The broad garment descriptions do not close the complete-coverage gate, and some include badge pixels. They are not substituted automatically for a user's instruction.

`right arm sleeve` selects the large visible sleeve on the viewer's left: 24,254 pixels. A new live recolour run produces navy fabric with the existing sleeve folds, leaving all 237,890 unselected pixels byte-exact. The independently repeated description generates the same binary mask used by the recolour case. The opposite-side description selects a much smaller region; that result alone cannot establish whether a model understands anatomical versus viewer-relative directions. Visible selection review remains mandatory.

This is a **scoped sleeve pass**, not a whole-garment or general small-part certification. Fine edge review remains necessary. The previously observed whole-garment seam/zipper omissions remain open. Evidence is in `workflows/garment-description-comparison.json` and the `garment-right-sleeve` run in `workflows/photo-corrections-qa.json`.

Reproduce the masks with `node --import tsx scripts/check-selection-refinement.ts --garment-descriptions`, then run `node --import tsx scripts/validate-photo-corrections.ts` with the retained fixture set. The latter resumes recorded cases; retain or archive its local report deliberately before rerunning an existing case. These diagnostics never alter a user's master or enable a new workflow.

## Verification and review status

- **Implemented:** recolour coverage preservation, regression test, retained-output comparison and selection-refinement diagnostic.
- **Not implemented:** the remaining quality gates listed above; no selection model change was promoted.
- **Test results:** 101 unit/integration tests pass; TypeScript and production build pass. Browser CI status is reported with the follow-up PR.
- **Live results:** nine native-refinement comparisons, six garment-description comparisons and a new sleeve-only recolour completed against the verified running Desktop instance. Alpha correction uses retained GPU output and deterministic recomposition, not a new generation or a glass-matting benchmark.
- **Known issues:** the open gates above still apply. This patch changes no browser interaction.
- **Git status:** follow-up branch `quality-gaps`, based on the approved PR #8 merge into `composite-workflow`; submit as a separate draft for review.
- **Recommendation:** review the bounded alpha correction independently. Keep Library expansion on hold and continue photographic garment-selection work without enabling the unsuccessful refinement experiment.
