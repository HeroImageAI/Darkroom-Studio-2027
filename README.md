# DARKROOM STUDIO 2027

Create. Edit. Finish.

A focused local AI image studio. The user chooses the result; Darkroom chooses the process.

This independent repository contains a Phase 1 foundation candidate: a local React workspace, SQLite/file storage, document revisions, recoverable jobs and one validated semantic image workflow. Full Create and Edit workflows are later phases. See [Phase 1 report](docs/PHASE_1_REPORT.md) for actual validation and limitations.

## Run locally

Use Node 24.20.0 (see .node-version). From the repository root:

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:2027. Start ComfyUI Desktop separately. The app verifies Desktop installation identity and probes only configured loopback/ports 8188–8198; it never installs or modifies models. Initial verification hashes the required weights and can take time; later checks cache hashes against file size/modification time. Missing or different weights keep the route unavailable.

Copy .env.example to .env to choose a dedicated data folder or loopback engine origin. Never reuse the legacy database. DR_MODEL_ROOTS can specify semicolon-separated model roots if Desktop paths cannot be read. Runtime data remains under data/ by default and is ignored by Git. Original files are immutable; document revisions are separate.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
npm run check:workflows
```

Browser tests use an isolated service on port 2028 with data/e2e. Chromium is the default; DR_TEST_BROWSER=msedge selects Edge when supported. DR_TEST_REUSE=1 explicitly reuses an existing isolated test service. The Windows sandbox used during development required a repository-local PLAYWRIGHT_BROWSERS_PATH and could not launch Edge reliably; Chromium passed.

Opt-in live GPU tests: `npx tsx scripts/live-foundation.ts` tests the semantic adapter; `npx tsx scripts/live-api-foundation.ts` tests the protected API/queue/worker/collection path. They refuse a busy engine, write synthetic outputs/evidence locally and do not interrupt other clients. Never treat API success as visual QA. After inspecting output, record evidence before enabling a matching manifest. Regenerating a graph resets validation.

## Planning baseline

- [Product specification](docs/DARKROOM_PRODUCT_SPEC.md)
- [Architecture and Phase 1 structure](docs/DARKROOM_ARCHITECTURE.md)
- [Build plan and phase gates](docs/DARKROOM_BUILD_PLAN.md)
- [Brand system](docs/BRAND_SYSTEM.md)
- [Legacy evidence and lessons](docs/LEGACY_LESSONS.md)
- [Future ideas](docs/FUTURE_IDEAS.md)
- [Phase 0 report](docs/PHASE_0_REPORT.md)
- [Complete supplied brief](docs/product-brief.md)

`main` is the reviewed baseline. Planning and implementation changes use feature branches and pull requests. HeroImageAI/Darkroom is read-only reference material; no legacy UI, runtime data, model weights or repository history is imported here.

Phase 1 was authorised in chat; its PR is stacked on the unmerged planning branch. Do not proceed to Phase 2 or merge automatically. See the build plan for explicit acceptance criteria.
