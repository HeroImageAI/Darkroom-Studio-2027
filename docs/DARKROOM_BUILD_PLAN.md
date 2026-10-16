# Darkroom Studio 2027 — build plan

Status: Phase 0. Work is incremental and gates are explicit. This baseline does not authorise automatic implementation of later phases.

## Repository strategy

Use only `HeroImageAI/Darkroom-Studio-2027` for this product. `HeroImageAI/Darkroom` is read-only evidence. No submodule, shared runtime database, copied history or five-studio architecture. The supplied remote was verified as an empty public repository on 16 October 2026 through the connected GitHub tools.

Bootstrap `main` with repository identity only because an empty GitHub repository cannot accept a normal branch-based pull request. Put the planning baseline on `planning-baseline` and open a draft PR against `main`; do not merge automatically. Phase 1 uses `foundation` from the reviewed main. Subsequent branches follow named product work: `create-workspace`, `edit-workspace`, `ai-routing`, `smart-selection`, `finish-workflow`, `branding-ui`, `library`.

Commit logical completed milestones. No force pushes or history rewriting. Main must contain reviewed work; propose required status checks and review protection when CI exists, and report actual configuration separately. Do not assert protections are enabled merely because this document requests them. Include exact head SHA and validation in every phase report.

## Phases and acceptance

| Phase | Deliverable | Gate before continuing |
| --- | --- | --- |
| 0 Product + architecture | Four required plans, exact Phase 1 tree, data/manifest/routing contracts, brand tokens, legacy lessons, test strategy | Coherent baseline committed on GitHub and reviewed; continuation authorised |
| 1 Foundation | React/TS/Vite shell, shared tokens/components, Fastify, SQLite migrations, immutable asset import, document revisions, persisted queue, SSE, verified ComfyUI connection and semantic manifest preflight | Tests/typecheck/build/browser pass; restart and isolation demonstrated; one genuine image operation inspected; no implied completion of Create |
| 2 Create | Brief, references, aspect/custom dimensions, Draft/Final, variations, evidence-backed Auto/override, candidate review, save version, Send to Edit | Reliable pleasant end-to-end Create; fidelity/intent tests; real Klein/Qwen generation/reference runs and visual assessment |
| 3 Edit foundation | One canvas/document, layers, transforms, masks, selections, crop, Undo/Redo, autosave and save conflict handling | Round-trip editable documents; original immutable; reload/recovery and keyboard tests |
| 4 Intelligent Edit | Visible target selection → describe → apply; remove/replace/recolour/background/expand/instruct; review controls | Golden set visual criteria pass; protected regions respected; no hidden master overwrite |
| 5 Finish | Restore, upscale, remove background, crop/resize, transparency, PNG/JPEG export | Alpha/dimensions tested; identity/design QA; consistent handoff into Affinity |
| 6 Composite | Multiple image layers, cutouts, guidance paint, harmonisation | Coherent result and faithful protected branding; non-destructive candidate review |
| 7 Branding | Exact editable text/logo/shape placement; true SVG handoff; justified layered PSD and native project handoff | Text/logo coordinates and export fidelity; raster/vector truthfulness; editable round-trip |
| 8 Library | Recent, boards/projects, search, favourites, versions, trash/restore | Retrieval and recovery tests; reference-safe deletion; stays lightweight |
| 9 Hardening | Reliability, VRAM/performance, compatibility, accessibility, installation/recovery | Repeated real-world task QA, upgrade/restart tests, benchmark review; no feature expansion |

## Phase 1 implementation sequence

1. Toolchain/workspace: strict TS boundaries, pinned dependencies/lockfile, test/build scripts, CI. Minimal branded shell with only Create/Edit/Library, project and save state. Setup is contextual, not a fourth product destination.
2. Persistence: migrations, transactional repositories, immutable filesystem assets, source metadata, schema-versioned documents/revisions and startup reconciliation. Test with isolated temporary storage, never legacy data.
3. Engine connectivity: configurable loopback discovery, Desktop identity verification, node/model enumeration and installed/missing/unvalidated status. Do not download or alter model folders.
4. Workflow boundary: semantic labels, typed bindings, graph hashes and strict preflight. Start with one minimal image manifest; keep it disabled until live validation is recorded.
5. Jobs/progress: one GPU worker, persistent state/idempotency, engine prompt association, SSE replay, cancellation boundaries and restart reconciliation.
6. Prove architecture: import source, save/reopen revision, submit a genuine small image job through the semantic adapter, persist result/provenance, inspect output. Use an internal integration harness; full Create interaction belongs to Phase 2.

Each item should form a reviewable commit or small PR. Avoid one enormous foundation commit. Dependencies are locked before implementation tests rely on them. Phase 1 is complete only when the whole gate passes, not merely when the shell starts.

## Test strategy and golden QA

Unit tests cover rules and invariants rather than mirroring UI markup. Integration tests run real SQLite/filesystem repositories and a fake engine for deterministic failure paths. Playwright covers visible workflows with fixtures; GPU runs are separately labelled. Every major phase requires unit/integration, strict TypeScript, production build, relevant browser tests and applicable visual AI QA. Keep Windows as a real target; Linux CI alone cannot prove workstation compatibility.

Permanent golden categories: product, garment, artwork/logo, person, environment, text-sensitive image, transparent object, composite, low-quality image and sketch. Use owned/licensed/synthetic material with consent/rights metadata; do not copy legacy images automatically. The initial catalog records category, intended task, source hash, rights, constraints and acceptance rubric. Binary input/output fixtures stay out of the public repository unless explicitly suitable for publication; use local fixture storage with tracked metadata.

Each run records input/output hashes and paths, verbatim prompt, reference order, mask, seed, workflow ID/version/hash, engine/model fingerprints, hardware, cold/warm state, render time, peak VRAM where measurable, evaluator, visual assessment and failure notes. Record unknown memory as unknown. Compare task outcomes rather than API status. “Remove the orange” fails if it remains; alpha tests inspect pixel alpha, not a checkerboard preview.

Suggested task rubrics: exact printed text comparison; product silhouette/feature preservation; target absence after removal; unselected-region preservation; visible seam assessment for expansion; identity/design review for restoration; transparency edge checks on multiple backgrounds; mask visibility before application. Automated metrics support human review rather than replacing it.

Before any ComfyUI update is accepted, rerun node/input/model compatibility checks plus relevant real workflows and golden cases. Historical timings are baselines, not promises. Benchmark Draft versus Final and cold versus warm independently. Never compare unmatched resolutions as equivalent quality evidence.

## Reporting and stop rule

Every phase report includes IMPLEMENTED, NOT IMPLEMENTED, TEST RESULTS, LIVE RESULTS, KNOWN ISSUES, GIT STATUS and RECOMMENDATION. Link evidence and distinguish mocks, historical results and current live runs. Record any blocked gate without labelling it passed. Stop at the phase boundary for review and explicit continuation; do not expand scope to occupy blocked time.

Phase 0 checks are document completeness, cross-links, requirement coverage, clean Git state and remote commit/PR verification. TypeScript/build/browser/model tests are not applicable to a documentation-only baseline; they become mandatory with Phase 1. No model or browser validation is claimed in Phase 0.
