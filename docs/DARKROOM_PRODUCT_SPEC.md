# Darkroom Studio 2027 — product specification

Status: Product baseline; implementation remains a scoped preview, with core corrections before Library expansion. Original proposal, 16 October 2026. The complete product-brief.md is the requirements source; this document converts it into a bounded product contract. No implementation or model validation is implied.

Continuation authorised 17 October: work may proceed through completion and reviewed integration without further phase approvals. This supersedes the original phase-boundary approval language below; the original scope and evidence gates still apply. See `COMPLETION_GATES.md`.

## Purpose and boundaries

Turn an idea, photograph, reference, sketch or rough artwork into a usable visual asset through local AI. Prioritise image quality, fidelity, understandable controls and safe iteration. Three destinations only: Create, Edit, Library. Finish belongs inside Edit; compositing also belongs inside Edit.

The user chooses the result. Darkroom chooses the process. Preserve creative intent and reveal technical settings only when requested. Reject scope that does not improve Create, Edit or Finish. No video, timeline, complete vector editor, page layout, print-production suite or full DAM. Affinity handles specialised production.

## Core experience

Home opens at Create with “What do you want to create?”, a large brief field, image drop/paste/browse, Create, Edit an image and recent work. No operational dashboard. Top navigation carries identity, Create/Edit/Library, project name, save state and contextual Export. Contextual left tools/assets/layers, central canvas/results, right instructions/properties. Home stays simpler than Edit.

Create controls: prompt; multiple references; Square, Portrait, Landscape, Vertical, Wide; Draft/Final; 1–4 variations; Generate. Advanced contains custom dimensions and Auto/Klein/Qwen override. Dimensional limits derive from the selected validated workflow. No silent prompt rewriting; proposals must preserve count, colour, text, branding, subject, exclusions, viewpoint, orientation and reference requirements.

Create results show actual outputs with candidate selection, retry, compare, save version and Send to Edit. Reference order and intent are stored. No example or placeholder image may be presented as a generated result. Missing models or engine show a clear setup state, preserve the brief and do not submit a job.

Edit interaction: indicate target → describe desired change → preview selection → apply → review candidate → accept/retry/compare/keep version. Original remains immutable. Candidate results never replace the master until accepted. A generation completing successfully is distinct from the user accepting its result.

Essential editing tools are introduced incrementally: move/transform, brush/eraser, mask, rectangle/lasso/selection brush, Smart Select, crop, pan/zoom. Smart Select supports click, multiple points, add/subtract, refine, rectangle and description; selection is visible before edits. Layers support images, AI results, paint, masks, text and simple vectors with visibility, lock, opacity, order, duplicate/delete and limited grouping. One document format serves all operations.

Finish offers restore, 2×/4× upscale, crop/resize, remove background, transparency and export. Preserve alpha. Simple branding later adds exact text/logo placement and basic shapes; retain editable text and vectors. Raster wrapped in SVG is never described as vectorisation.

Library later offers recent, projects/boards, search, favourites, originals, masters, versions, exports and recently deleted. Initial foundation storage endpoints do not imply the full Library is complete.

## Outcome contracts

| Workflow | Success | Failure examples |
| --- | --- | --- |
| Product presentation | Better lighting/background with shape, packaging, logo, text, colour and proportions intact | Redesigned packaging or invented product details |
| Artwork extraction | Isolated, corrected artwork with colour/design fidelity; genuine alpha where requested | Invented lettering, residual shirt, misleading vector label |
| Change | Requested target changes and protected regions remain faithful | Orange remains after “remove the orange”; changed face outside mask |
| Concept | Coherent requested directions from brief/references | Changed counts, exclusions or reference subject |
| Restore | Less damage with identity/design preserved and before/after available | New facial identity, invented details presented as recovered truth |
| Remove background | Intended subject retained with usable alpha, including edges | Opaque checkerboard baked into pixels, missing subject |
| Expand | New image area is coherent; original area preserved under operation contract | Seams, white fill, unintended source changes |
| Upscale | Requested dimensions, retained alpha and acceptable detail | Lost alpha or new design/text |

Reconstruction beyond minor repair must be explicit in result provenance. Product fidelity outranks creativity. Original file, editable master, meaningful versions and delivery exports are distinct records.

## Delivery sequence and success

Phase 1 proves infrastructure only. Phase 2 proves pleasant reliable Create before Phase 3 canvas work. Subsequent phases add intelligent edit, finish, composite, branding, library and hardening in that order. Each phase reports implemented/not implemented, automated/live results, known issues, Git status and recommendation. No implicit approval to cross major phase boundaries.

First-time users should understand Create → Edit → Finish within minutes without seeing workflows or node graphs. Evaluate this with observed tasks during browser QA rather than merely checking that controls exist.

## Open dependencies

The branding reference image has now been supplied and visually reviewed; BRAND_SYSTEM.md records the interpretation and originality boundaries. Engine/model inventory and historical benchmark conclusions require revalidation on the current workstation. Model availability does not establish permission for every intended use; record verified source/licence metadata during setup, without assuming legacy licence summaries are current.
