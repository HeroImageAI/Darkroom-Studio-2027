# Phase 2 — Create workspace

16 October 2026. Review candidate; no automatic merge or Phase 3 work. This branch is stacked on the unmerged foundation PR.

## IMPLEMENTED

Create now has a verbatim natural-language brief, file/drop/paste references, ordered reference previews, removal/reordering, saved-image reuse, five aspect presets, Draft/Final, 1–4 variations and a single Generate action. Advanced contains Auto/Klein/Qwen, a seed and bounded custom dimensions. Reference drafts and explicitly saved briefs survive browser reload. Saved creations can be loaded again with their original brief/settings or retried as a new creation.

Variations are independent persisted jobs with deterministic successive seeds and serial GPU execution. The UI shows queued/running/ready/error states and real progress where supplied. Lost HTTP acknowledgements retain the original idempotency key and random seed for a retry. Replaying an accepted request returns the original batch even if engine readiness changes.

Results support candidate selection, reference/result comparison, accept, reject, named version storage and Send to Edit. Accept/save creates an independent versioned master; it never overwrites a reference or another candidate. Review calls are idempotent. Rejected candidates remain recoverable as retained assets. Creation/job/candidate history is stored in SQLite and survives reloads.

Eight semantic graph variants cover Klein/Qwen and zero through three references. Each graph is pinned by hash, model bytes are pinned by SHA-256, and routing requires matching engine evidence, reference count, pixel budget and quality. Reference uploads are normalised for orientation in a separate engine input copy; original bytes remain unchanged. Trusted upload receipts permit subfolder inputs without trusting arbitrary paths. Preflight supports current ComfyUI autogrow inputs and COMBO declarations. Fingerprints exclude transient upload menus and unrelated node classes so each upload does not invalidate its own route.

Recovery now re-verifies Desktop identity/discovery before reconciling old jobs, checks tagged history/queue for lost acknowledgements and detects stalled recovered jobs. It does not blindly resubmit or globally interrupt another engine client.

## NOT IMPLEMENTED

Phase 3 canvas/layer/transform/mask/crop editing and autosave commands; intelligent edits, finish/export suite, advanced branding and full Library features. Send to Edit opens the actual saved result/master in the existing preview; it does not imply canvas editing is complete. Prompt enhancement remains absent, so no important intent is silently rewritten.

## TEST RESULTS

- Local validation passed: 48 unit/integration tests, five Chromium browser tests, strict TypeScript and the production build. Tests cover routing/reference limits, exact prompt preservation, atomic/idempotent batches, seed wrapping, reference order/ownership/integrity, independent versions, review idempotency, history recovery, upload receipts and dynamic node contracts.
- Five Chromium browser cases cover the original foundation flows plus Create reference/order/settings, candidate review/comparison/version/Send to Edit, reload and lost-response idempotency. The two added UI cases use explicitly mocked responses inside test source; they are not model validation. Real model execution is separately recorded below.
- Tests use isolated fixture storage. No passing API response is used as proof of visual quality. CI results must be distinguished from local runs.

## LIVE RESULTS

ComfyUI Desktop 0.41.2 on RTX 3090. Existing model weights were used without downloads or changes. Both families ran actual generation/reference workflows at Draft and Final settings. Sixteen render cases completed with expected dimensions; fifteen passed the limited synthetic visual rubric and one failed.

The owned fixture is a simple black cylindrical perfume bottle, black cap and cream NOIR / EAU DE PARFUM label. Additional references supply a navy background and a left-side light guide. Generation cases request one cream NOIR card on charcoal. The rubric checks intended subject count, main visible text, background direction, absence of guide objects and dimensions. It does not establish pixel-exact commercial product fidelity, material identity or all possible prompts.

**Failed case:** Qwen Draft with three references copied the lighting-guide rectangle into the generated scene. That quality/graph combination is unavailable. Qwen Final did not reproduce the extra guide object in this case. Auto uses Klein for three-reference Draft. An explicit Qwen/Draft/three-reference request receives an actionable limitation rather than a silent incompatible override.

For ordinary Draft generation, Klein is preferred for measured iteration speed. Qwen is preferred for Final, visible-text requests and one/two-reference fidelity, supported by the scoped current checks and the legacy per-feature QA cited in LEGACY_LESSONS.md. Both models passed the simple NOIR text case; that case alone does not prove Qwen universally better at typography. Preferences remain central policy, not UI conditionals.

A separate real API → queue → worker run created four three-reference Auto/Draft variations serially in 69,626 ms after submission. All four outputs were visually inspected; each has a single bottle and NOIR label without the guide rectangle. Exact reference bytes were verified unchanged. Submission replay created no additional jobs; named version storage and live browser comparison/Send to Edit were verified. Different seeds produce design/lighting variation; this is reference-based creation, not an exact protected product-edit guarantee.

A further generation submitted through the real browser UI completed with Auto selecting Qwen, one reference, Final, 1024 × 1024, in 33,658 ms. Visual inspection confirmed one black bottle, cream label and the requested NOIR / EAU DE PARFUM text. Its scoped evidence is data/create-live/evidence/ui-run.json; this is separate from mocked browser tests.

Local raw evidence: data/create-qa/runs.json, its sixteen PNGs and reference PNGs; data/create-live/evidence/run.json and four actual variation PNGs. These remain outside Git. The table below records the scoped run observations. Timings include load/cache differences and differing resolutions; do not read them as matched-quality speed comparisons. GPU figures are sampled whole-GPU use, not precise per-model allocation.

| Model | Refs | Quality | Dimensions | Time | Peak GPU used | Visual result |
| --- | ---: | --- | --- | ---: | ---: | --- |
| klein | 0 | Draft | 768 × 768 | 5.3 s | 19.3 GiB | Scoped pass |
| klein | 0 | Final | 1216 × 832 | 7.3 s | 19.2 GiB | Scoped pass |
| klein | 1 | Draft | 768 × 768 | 8.4 s | 19.2 GiB | Scoped pass |
| klein | 1 | Final | 832 × 1216 | 9.7 s | 19.3 GiB | Scoped pass |
| klein | 2 | Draft | 768 × 768 | 11.5 s | 19.3 GiB | Scoped pass |
| klein | 2 | Final | 768 × 1344 | 13.6 s | 19.2 GiB | Scoped pass |
| klein | 3 | Draft | 768 × 768 | 15.0 s | 19.6 GiB | Scoped pass |
| klein | 3 | Final | 1344 × 768 | 18.0 s | 20.3 GiB | Scoped pass |
| qwen | 0 | Draft | 768 × 768 | 14.6 s | 18.7 GiB | Scoped pass |
| qwen | 0 | Final | 1216 × 832 | 22.9 s | 16.1 GiB | Scoped pass |
| qwen | 1 | Draft | 768 × 768 | 13.6 s | 19.1 GiB | Scoped pass |
| qwen | 1 | Final | 832 × 1216 | 27.0 s | 19.3 GiB | Scoped pass |
| qwen | 2 | Draft | 768 × 768 | 16.7 s | 20.3 GiB | Scoped pass |
| qwen | 2 | Final | 768 × 1344 | 30.1 s | 20.5 GiB | Scoped pass |
| qwen | 3 | Draft | 768 × 768 | 19.9 s | 21.2 GiB | FAIL · unavailable |
| qwen | 3 | Final | 1344 × 768 | 34.3 s | 21.3 GiB | Scoped pass |

## KNOWN ISSUES

References are limited to three; dimensions are multiples of 16, 256–1536 per side and at most 1,572,864 pixels. Draft presets are smaller than Final. Qwen uses 25/40 steps; distilled Klein uses four steps for both, with preset resolution providing the Draft/Final distinction. Running jobs cannot be globally cancelled safely when sharing ComfyUI; queued variations can be cancelled.

Validation is intentionally small and synthetic. The remaining permanent golden categories and broad real product/garment/person benchmarks are not claimed complete. Restored detail or exact branding fidelity is not inferred from these Create cases. Model source/licence metadata still needs authoritative review for intended use; no commercial-use licence assurance is made.

The workstation's exact engine/model fingerprint is validated; different weights or engine capabilities require revalidation. A first connection hashes several large existing files and can take time. The simple reference path may change shape/material interpretation, which users must review before accepting. Native project export and full editable canvas recovery are later phases.

## GIT STATUS

create-workspace is based on foundation because earlier PRs remain unmerged. Logical commits separate Create implementation, visual validation/routing limits and final recovery/QA work. The final handoff records the published commit and PR. No main/legacy modifications, force pushes or destructive history operations.

## RECOMMENDATION

Review the Create candidate and explicit Qwen three-reference Draft limitation. Verify CI, then approve the phase before Phase 3. The next phase is the coherent editing canvas; do not expand into intelligent edits or finishing early.

