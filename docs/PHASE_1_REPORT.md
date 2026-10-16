# Phase 1 — foundation candidate

16 October 2026. This phase is ready for review, not automatically merged. It does not authorise Phase 2.

## IMPLEMENTED

- React, strict TypeScript and Vite shell with Create/Edit/Library; original D/frame mark, central design tokens and restrained exposure curves inspired by the supplied reference.
- Fastify loopback service, Host/Origin/session-token checks, bounded PNG/JPEG/WebP import with actual decoding, immutable filesystem sources and SQLite metadata.
- Project records, image previews/search, initial editable document snapshots, immutable revisions, expected-revision conflicts and named version endpoints. UI can save the initial master; canvas editing/autosave commands are Phase 3.
- Persistent jobs, idempotency, a serial worker, owned job tags, engine history/queue reconciliation, uncertain-acknowledgement handling, queued cancellation, deadline handling and durable SSE replay. No global interrupt/free calls that could disrupt another ComfyUI client.
- Verified ComfyUI Desktop identity; live model/node/input preflight; semantic bindings and graph hashes; one scoped Klein generation route linked to visual evidence and current engine/capability fingerprint.
- Deterministic integration tests, Playwright flows, opt-in live GPU scripts, CI definition for Windows/Linux, golden QA category catalog and setup/run instructions.

## NOT IMPLEMENTED

Full Create controls, reference-based generation, variation review, multiple-model Auto ranking, Qwen execution, smart selection, canvas tools, layers UI, mask editing, finishing, branded exports, library boards/favourites/trash, installation packaging and full golden-set outcomes. The visible source download preserves the imported bytes; it is not a finished export workflow. Brief saving is browser-local and labelled accordingly.

## TEST RESULTS

- 31 unit/integration tests passed on Windows: semantic contracts, intent preservation, routing eligibility, real SQLite/filesystem round-trip, corrupt upload rejection, document conflicts, project isolation, deduplication, durable events, security boundary and restart/unknown-submission recovery.
- Strict TypeScript passed. Vite production interface build passed.
- Three Chromium browser tests passed: shell/navigation/setup and brief reload; real PNG import/initial master/library reload; keyboard focus and 390 px layout without horizontal overflow.
- Edge failed before page creation because of sandbox profile-file handling. Official Playwright Chromium Headless Shell launched and passed the suite. A corrupt test fixture was replaced with a generated valid PNG. The final browser suite was rerun against a fresh isolated service on port 2029 after persistence/discovery hardening. E2E storage is separate from normal application storage.
- CI configuration exists; remote CI results must be checked on the PR. Do not claim that local success establishes a passing GitHub run.

## LIVE RESULTS

ComfyUI Desktop 0.41.2, current installation identity verified, NVIDIA RTX 3090. The engine changed from 0.41.1 around the outage; current preflight was rerun.

1. Semantic-adapter smoke: 512 × 512, seed 2027, four Klein steps, tiled decode. Queue-to-output measured 11,687 ms; peak whole-GPU used memory sampled at approximately one-second intervals: 20,135,113,368 bytes (~18.8 GiB). Includes other GPU allocations and does not certify a precise allocation peak. Output SHA-256: `c98bffa872c3dbe5a8a1ea335d99717a2e2aa27af0345e9a93413a9fa85fb816`.
2. API/queue/worker smoke: submitted through the session-protected job endpoint; persisted state/progress and collected image. Observed completion in 4,562 ms after queue response; 13 persisted events. Output SHA-256: `79e672e7b9d4e8f2d82354de5c90d7b54fe8782bec3ed85fd2a4ad94630e6660`. Warm/cache conditions differ, so do not interpret this as a comparable benchmark improvement.

Both actual output images were visually inspected: a single red sphere on a charcoal cube, dark background, white edge light and no visible text/logo. First sphere is slightly egg-shaped; second is glossy. These pass the limited infrastructure smoke task, not general product-fidelity or material-accuracy certification. No user's source imagery was used.

Local raw evidence is under `data/live-foundation/evidence/` and `data/live-api-foundation/evidence/`; runtime data, generated images and machine-specific raw provenance are excluded from Git. The public report records scoped results and hashes. No models were downloaded or modified. Browser test runtime downloads are separate from AI models.

## KNOWN ISSUES / DESIGN ADJUSTMENTS

- Required weights have full SHA-256 content hashes recorded in the manifest. A first connection hashes the files; later checks cache against size/modification time and invalidate changed content. Current authoritative licence verification remains pending; no commercial-use licence assurance is implied by an installed model.
- The small route is tied to this validated engine fingerprint; another installation/update requires revalidation. The Auto policy intentionally does not invent cross-model quality rankings.
- Setup reports required models as missing, installed/unvalidated or installed/verified, and Qwen as optional pending Phase 2 validation. A token-protected connection endpoint and `.env` accept only loopback origins. Discovery checks the configured address and bounded ports 8188–8198 against Desktop identity. The UI uses the configured connection; an interactive address editor is deferred.
- Foundation uses compact service modules (`store.ts`, `comfy.ts`, `worker.ts`, `app.ts`) rather than every separately named file in the proposed tree. Pure contracts/document/workflow/routing boundaries remain separate. SQLite has numbered transactional migrations, consistent pre-upgrade database backups and tested rollback. Immutable file writes are flushed before rename and SQLite uses FULL synchronous writes. Group/mask-layer schema expansion remains gated to editing work.
- Root dependency installation uses `--workspaces=false --install-links` because this Windows sandbox could not create npm workspace symlinks. Apps retain separate folders and package identity; internal modules use explicit source imports. One root lockfile pins dependencies. No desktop wrapper or installer is included.
- Recovery tests simulate the engine forgetting jobs and application reopen. No real ComfyUI restart was forced, to avoid interrupting the user's running engine. Worker ownership is leased transactionally across database connections, heartbeated and safely released. Multiple services using the same data folder cannot concurrently own its queue. Other applications can still use ComfyUI; Darkroom waits on their queued work and never interrupts it.
- Browser automation server teardown was unreliable in this sandbox. The isolated test server can remain until the execution session ends; production data is separate. This is not evidence of an engine/job failure.
- The ten-category permanent golden set has metadata placeholders, not approved images or passed model outcomes. Acquire suitable owned/licensed fixtures before Phase 2 benchmarks.
- Phase 1 is a reviewable foundation candidate with the stated scope and validation limits. Branch protection has not been configured. GitHub CLI authentication is unavailable; publication uses the connected GitHub tools.

## GIT STATUS

Work is on `foundation`, stacked on `planning-baseline` because PR #1 is unmerged. Logical local commits retain toolchain/contracts, storage/jobs, UI and validation milestones. The final handoff records the published head/PR. No force pushes or legacy repository writes; main remains unchanged.

## RECOMMENDATION

Review the foundation before authorising Phase 2. The local automated/type/build/browser checks, migration backup/rollback, bounded discovery, exact model inventory and worker ownership checks pass. Real execution and visual inspection pass for the limited Klein smoke workflow. Check remote CI and review the limitations above before merging. Do not silently begin Phase 2.

## Hardened verification follow-up

After adding model hashes, the semantic smoke was rerun on the same engine: output hash stayed identical; 3,492 ms measured queue-to-output with warm/cache conditions and 20,547,703,448 bytes peak sampled whole-GPU usage. API/worker execution was rerun after migrations and leasing: 4,585 ms after the response, same output hash. Current local run.json files describe these follow-up runs; initial observations above are retained as historical measurements. Neither timing is a matched benchmark claim.
