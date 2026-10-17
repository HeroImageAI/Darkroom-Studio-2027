# Recolour model validation

17 October 2026. Follow-up to WINDOWS_IMAGE_ACCEPTANCE.md. This closes the decision to evaluate Klein beyond the first mug case; it does not certify every image-editing outcome.

## Product correction

Recolour now uses the already-installed, already-validated Klein 9B two-reference workflow with four distilled steps. The frozen master is reference one and the visible allowed-region mask is reference two. Verbatim instructions, dimensions, source alpha, protected-pixel compositing and explicit candidate review remain unchanged. Background, Expand, Remove, Replace and Instruct retain their existing Qwen routes. No model, package, graph, control or product destination is added.

An obsolete queued recolour job whose stored model no longer matches the validated route fails before upload/submission with clear retry guidance. This avoids claiming a Klein validation while executing a legacy Qwen job. Already-running work continues to use the existing renderer-signature recovery protections. Originals are never silently accepted or overwritten.

## Evidence

Four fresh Klein GPU checks use the exact native RGBA source bytes and the same two-reference prompt template as the app:

- Generated photographic-style mug: cleaner forest-green ceramic and readable NOIR, without the heavy Qwen texture failure. Small allowed background/shadow differences remain.
- NASA garment photograph: navy fabric and folds retained; protected face, badges and equipment exact. Orange remnants from omitted selection pixels are still a selection limitation.
- Owned sphere graphic: blue sphere and protected label retained. Small shadow/join variation within the allowed region remains.
- Artificial translucent derivative: source alpha exact and blue pigment visible on white/dark backgrounds. This is an alpha-ramp check, not glass matting.

All four retain every protected RGBA byte and source alpha. The comparison is about delivered quality, not equal-compute speed: Klein uses four distilled steps, Qwen uses 40. Observation timing and model residency are not controlled cold/warm benchmarks.

`workflows/recolour-model-validation.json` records exact source/mask/model/graph/output hashes, instructions, seeds and live evidence. `scripts/validate-recolour-model.ts` reproduces the bounded checks using an explicit isolated `DR_QA_ORIGIN`; `--live` checks app → queue → engine → protected candidate, without accepting it. Submission journals retain graph/reference identity to observe pending runs without duplicating work.

121 unit/integration tests and the production build pass locally. New tests verify Recolour selects Klein while Remove retains Qwen, immutable request/source handling, and fail-closed handling of an obsolete queued route. Windows browser CI and the exact reviewed head are recorded on the PR. Existing protection/alpha/review/reload tests remain part of the full suite.
