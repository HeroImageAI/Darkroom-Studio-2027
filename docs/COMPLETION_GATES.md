# Darkroom completion gates

Updated 17 October 2026. The user authorises continued work through completion, including routine decisions and phase progression without another approval request. This supersedes earlier phase-boundary approval instructions; tests, review, immutable originals and evidence requirements still apply. Platform permission restrictions remain separate.

The latest user instructions in `CURRENT_SCOPE.md` define the current scope and override broader requirements in `product-brief.md`. Windows image generation and editing are the release focus; vector work and expanded branding/handoff are excluded. Completion means passing its bounded outcomes, not adding every possible editing feature. The earlier approximate 70% estimate is not an acceptance metric. A gate is complete only with linked evidence; partial results remain partial.

| Gate | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Persistence and coherent Edit | Phase 1/3 reports, scope corrections | Repeat recovery, conflicts and native project round-trip in release testing |
| Create and references | Phase 2; validated Klein/Qwen routes | Representative photographic product/concept cases; intent, counts, lettering and reference fidelity |
| Smart selection and local edits | Selection validation and photographic comparisons | Reliable object clicks/small parts; garment seams/edges with protected branding; visible refinements |
| Product presentation and composite | Scoped product/composite evidence | Real photographic product fidelity, joins, shadows and protected design |
| Artwork extraction | Reviewed planar perspective tool plus manual selected-artwork isolation, controlled design and live UI copies; see `ARTWORK_EXTRACTION.md` | Photographed artwork/design fidelity, curved-fabric correction, cleanup and isolation; truthful raster output |
| Upscale and alpha | PR9 review, 107-test baseline, GPU comparisons | Broader photographic detail, hair and translucent edges; supported practical dimensions |
| Restore | Protected surroundings only | Demonstrate reduced damage with identity/design retained; source copying alone does not close this gate |
| Background removal and clear glass | BiRefNet ordinary cutouts; isolated guided matte experiment | Photographic transparency, foreground colour recovery and validated native workflow |
| Image delivery | Existing PNG/JPEG export | Windows image dimensions, colour, transparency and saved-master recovery |
| Saved work | Basic access and projects | Simple retrieval and recovery for image work; no expanded Library feature programme |
| UX/UI | Existing browser flows and brand tokens | Observed Create → Edit → Finish tasks, keyboard/focus, readable states, recovery guidance and practical viewport review |
| Release | Windows CI through PR12 | Integrate reviewed stack; install/upgrade/restart, storage, compatibility, cold/warm VRAM/performance and complete end-to-end acceptance |

## Working order

1. Audit official prompt/node/settings guidance against the installed versions, then close core quality outcomes through controlled comparisons. No candidate is enabled from publisher claims alone.
2. Integrate reviewed, passing milestones with history intact; main must represent stable reviewed work.
3. Keep saved-work access simple; do not expand Library while image quality remains the priority.
4. Finish release testing and the acceptance matrix. Do not label unresolved model limits as completed outcomes.

## Checks applied to each change

- Prompt: preserve verbatim intent, counts, colours, exclusions, text, reference order and viewpoint. Any material enhancement must be a visible proposal.
- Workflow: verify the exact local model/encoder/VAE/node compatibility, latent geometry, sampler, guidance, steps, alpha path and implementation fingerprints. Compare matched cases and inspect actual images.
- UX/UI: retain Create/Edit/Library only, one coherent canvas, visible selection and candidate review, simple outcome wording, Advanced for technical settings, and central brand tokens.
- Validation: appropriate meaningful regression tests, typecheck/build, relevant browser tests and real GPU visual assessment where behaviour changes. Protect originals and existing user masters.
- Reporting: record input/output/model/graph hashes, settings, measured timing scope, visual failures and remaining limits. Successful execution is not a visual pass.
