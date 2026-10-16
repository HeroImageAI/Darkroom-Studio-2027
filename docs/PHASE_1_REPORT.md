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

- 27 unit/integration tests passed on Windows: semantic contracts, intent preservation, routing eligibility, real SQLite/filesystem round-trip, corrupt upload rejection, document conflicts, project isolation, deduplication, durable events, security boundary and restart/unknown-submission recovery.
- Strict TypeScript passed. Vite production interface build passed.
- Three Chromium browser tests passed: shell/navigation/setup and brief reload; real PNG import/initial master/library reload; keyboard focus and 390 px layout without horizontal overflow.
- Edge failed before page creation because of sandbox profile-file handling. Official Playwright Chromium Headless Shell launched and passed the suite. The final test run reused the same isolated E2E server after replacing a corrupt test fixture with a generated valid PNG. E2E storage is separate from normal application storage.
- CI configuration exists; remote CI results must be checked on the PR. Do not claim that local success establishes a passing GitHub run.

## LIVE RESULTS

ComfyUI Desktop 0.41.2, current installation identity verified, NVIDIA RTX 3090. The engine changed from 0.41.1 around the outage; current preflight was rerun.

1. Semantic-adapter smoke: 512 × 512, seed 2027, four Klein steps, tiled decode. Queue-to-output measured 11,687 ms; peak whole-GPU used memory sampled at approximately one-second intervals: 20,135,113,368 bytes (~18.8 GiB). Includes other GPU allocations and does not certify a precise allocation peak. Output SHA-256: `c98bffa872c3dbe5a8a1ea335d99717a2e2aa27af0345e9a93413a9fa85fb816`.
2. API/queue/worker smoke: submitted through the session-protected job endpoint; persisted state/progress and collected image. Observed completion in 4,562 ms after queue response; 13 persisted events. Output SHA-256: `79e672e7b9d4e8f2d82354de5c90d7b54fe8782bec3ed85fd2a4ad94630e6660`. Warm/cache conditions differ, so do not interpret this as a comparable benchmark improvement.

Both actual output images were visually inspected: a single red sphere on a charcoal cube, dark background, white edge light and no visible text/logo. First sphere is slightly egg-shaped; second is glossy. These pass the limited infrastructure smoke task, not general product-fidelity or material-accuracy certification. No user's source imagery was used.

Local raw evidence is under `data/live-foundation/evidence/` and `data/live-api-foundation/evidence/`; runtime data, generated images and machine-specific raw provenance are excluded from Git. The public report records scoped results and hashes. No models were downloaded or modified. Browser test runtime downloads are separate from AI models.

## KNOWN ISSUES / DESIGN ADJUSTMENTS

- Model discovery verifies current filename/options and engine capability fingerprints. Full weight-content hashes, current authoritative licence verification and file-change-aware validation caches remain to be implemented before broader routing claims. No commercial-use licence assurance is implied by an installed model.
- The small route is tied to this validated engine fingerprint; another installation/update requires revalidation. The Auto policy intentionally does not invent cross-model quality rankings.
- Core model families are enumerated, but detailed installed/missing/optional capability cards and interactive connection selection are not complete. Configure the loopback endpoint through `.env`; discovery reads current Desktop installation identity and defaults to the known local port. Automatic bounded port discovery is still pending.
- Foundation uses compact service modules (`store.ts`, `comfy.ts`, `worker.ts`, `app.ts`) rather than every separately named file in the proposed tree. Pure contracts/document/workflow/routing boundaries remain separate. SQLite has an initial transactional schema/version marker; forward migrations with backups are pending before schema evolution. Group/mask-layer schema expansion remains gated to editing work.
- Root dependency installation uses `--workspaces=false --install-links` because this Windows sandbox could not create npm workspace symlinks. Apps retain separate folders and package identity; internal modules use explicit source imports. One root lockfile pins dependencies. No desktop wrapper or installer is included.
- Recovery tests simulate the engine forgetting jobs and application reopen. No real ComfyUI restart was forced, to avoid interrupting the user's running engine. Full multi-process worker leasing and weight-content validation are pending hardening items; run one normal workspace service instance.
- Browser automation server teardown was unreliable in this sandbox. The isolated test server can remain until the execution session ends; production data is separate. This is not evidence of an engine/job failure.
- The ten-category permanent golden set has metadata placeholders, not approved images or passed model outcomes. Acquire suitable owned/licensed fixtures before Phase 2 benchmarks.
- Phase 1 therefore remains a reviewable candidate with the gaps above, not an unconditional pass of every proposed architecture gate. Branch protection has not been configured. GitHub CLI authentication is unavailable; publication uses the connected GitHub tools.

## GIT STATUS

Work is on `foundation`, stacked on `planning-baseline` because PR #1 is unmerged. Logical local commits retain toolchain/contracts, storage/jobs, UI and validation milestones. The final handoff records the published head/PR. No force pushes or legacy repository writes; main remains unchanged.

## RECOMMENDATION

Review the foundation and the explicit gate gaps. Complete forward-migration/backup support, bounded discovery, model-content inventory and multi-process queue ownership before declaring the entire Phase 1 gate passed. Do not silently begin Phase 2. The app shell, local persistence and the real semantic execution path are proven within the stated limits.
