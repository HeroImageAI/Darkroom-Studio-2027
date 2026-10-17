# Golden QA set

The catalogue tracks all ten required image categories. Product/text-sensitive Create, owned branding and composite checks have scoped evidence from their phase reports. Core corrections add public/owned fixtures and actual GPU runs for garment, person, environment, transparent object, low-quality image and sketch. See `docs/SCOPE_CORRECTIONS.md` for explicit passes, failures and partial outcomes. Coverage does not mean every category has passed its general product gate.

Public fixture URLs, hashes, credits and rights sources are in `photo-sources.json`. Run `npx tsx scripts/prepare-photo-fixtures.ts` to prepare them under ignored `data/scope-qa`. Subject/SAM validation and photo-correction scripts are opt-in GPU checks and do not accept a candidate or automatically enable a route after visual review. Keep private images out of Git.

Each case needs a source hash, usage rights, prompt, protected regions/identity/text, output requirements and a visual acceptance rubric. Actual runs retain graph/model/engine evidence, settings and output hashes. Missing or partial cold/warm and VRAM evidence must not be presented as a performance benchmark.

The synthetic sphere/cube smoke test is an infrastructure check, not a substitute for photographic fidelity QA. General restoration, clear-glass matting, detailed garment edges and artwork perspective extraction remain open gates.
