# Darkroom Studio 2027 — architecture

Status: Phase 0 design. Paths below define the exact Phase 1 target structure; they are planned, not implemented.

## Decisions

React + strict TypeScript + Vite frontend; Node.js + Fastify TypeScript backend; SQLite metadata and filesystem assets; SSE browser progress; backend-owned ComfyUI connection. Use npm workspaces and one lockfile. Choose the supported Node LTS and pin dependency versions when Phase 1 begins. Avoid adding a desktop wrapper until installation requirements justify it.

Keep document, workflow and routing logic in independent packages; UI components never contain model decisions or Comfy node IDs. Fastify owns file IO, job orchestration, persistence and engine access. The browser uses typed HTTP contracts and SSE. Engine graphs remain internal.

## Phase 1 repository tree

```text
apps/
  web/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    src/
      main.tsx
      app/{App.tsx,Navigation.tsx,Shell.tsx}
      screens/{Create.tsx,Edit.tsx,Library.tsx,Setup.tsx}
      components/{Button.tsx,Field.tsx,Panel.tsx,Status.tsx,Dialog.tsx}
      lib/{api.ts,events.ts}
      styles/{tokens.css,global.css}
  api/
    package.json
    tsconfig.json
    src/
      {main.ts,app.ts,config.ts}
      routes/{health.ts,setup.ts,assets.ts,projects.ts,jobs.ts,events.ts}
      db/{connection.ts,migrate.ts,repositories.ts}
      db/migrations/001_foundation.sql
      assets/{store.ts,validate.ts,reconcile.ts}
      jobs/{queue.ts,worker.ts,recovery.ts,events.ts}
      comfy/{client.ts,discovery.ts,preflight.ts,adapter.ts}
packages/
  contracts/{package.json,tsconfig.json,src/index.ts}
  document/{package.json,tsconfig.json,src/{schema.ts,revisions.ts}}
  workflows/{package.json,tsconfig.json,src/{manifest.ts,bind.ts,validate.ts}}
  routing/{package.json,tsconfig.json,src/{policy.ts,evidence.ts}}
workflows/{README.md,manifests/,graphs/}
tests/{unit/,integration/,e2e/,fixtures/,golden/{README.md,catalog.json}}
scripts/{check-workflows.ts,check-planning.mjs}
docs/                         # Phase 0 documents retained
.github/{workflows/ci.yml,pull_request_template.md}
.env.example
.gitignore
README.md
package.json
package-lock.json
tsconfig.base.json
playwright.config.ts
vitest.config.ts
```

Braces above enumerate concrete files. Phase 1 screens are shell/setup placeholders; no production Create/Edit tools or nonfunctional feature controls. Golden catalog is metadata only until authorised, suitable fixtures are supplied. Graphs/manifests contain only scoped validated image workflows, never imported wholesale.

Runtime data lives in an explicitly configured writable directory, outside source control, with `studio.sqlite`, `assets/<sha256>.<ext>`, `thumbnails/`, `documents/`, `exports/`, `tmp/`, `backups/`. Do not point it at legacy Darkroom data. Default onboarding proposes a dedicated Darkroom Studio 2027 data folder; user can change it. Model folders remain managed by ComfyUI.

## Data model and invariants

All entities have UUID IDs and UTC timestamps; persist schema versions. SQLite foreign keys enabled; migrations transactional, backed up and tested. WAL for local concurrency. JSON columns are schema-validated at the boundary, not untyped escape hatches.

| Record | Essential fields and relationships |
| --- | --- |
| Project | id, name, createdAt, updatedAt, deletedAt |
| Asset | id, sha256, relativePath, mime, byteSize, width, height, hasAlpha, origin(import/generated), sourceAssetId?, provenanceJson, deletedAt |
| ProjectAsset | projectId + assetId, role(original/reference/result/export), favourite, displayName |
| Document | id, projectId, originalAssetId, currentRevisionId, schemaVersion, updatedAt |
| Revision | id, documentId, parentRevisionId?, snapshotPath, snapshotHash, createdAt; immutable |
| Version | id, documentId, revisionId, name, createdAt; named checkpoint |
| Export | id, revisionId, assetId, format, colourProfile?, settingsJson, createdAt |
| Job | id, projectId, documentId?, baseRevisionId?, intentJson, workflowId/version/hash, routeDecisionJson, enginePromptId?, status, progress?, error?, idempotencyKey, createdAt, startedAt?, finishedAt? |
| JobResult | id, jobId, assetId, variationIndex, seed, disposition(candidate/accepted/rejected), createdAt |
| JobEvent | jobId + sequence, type, payloadJson, createdAt; SSE replay |
| WorkflowValidation | workflowId/version/hash + engineFingerprint, modelsFingerprint, evidenceId, status, checkedAt, reportJson |
| RoutingEvidence | id, task, workflowHash, modelFingerprint, engineFingerprint, hardware, goldenSetVersion, runMetricsJson, assessment, artifactPaths, assessedAt |
| Setting | key, valueJson, schemaVersion; no secrets in frontend payloads |

Document snapshots: `{schemaVersion, id, width, height, colourSpace, layers[], selection?, metadata}`. Each layer stores id, type(raster/generated/paint/mask/text/vector), name, visible, locked, opacity, transform(x/y/scale/rotation), parentGroupId?, and type-specific content (asset reference, mask reference, editable text, or genuine vector geometry). Masks reference immutable assets plus target layer; references cannot form cycles. Layer order is explicit. Enforce bounded group depth. Phase 1 establishes schema/revision persistence; Phase 3 implements editing commands and Undo/Redo.

Original assets are immutable. Autosave writes a new revision then compare-and-swaps currentRevisionId; concurrent writes return conflict rather than losing edits. Snapshot/file writes use temporary files and atomic rename before DB reference commits. Startup reconciliation finds orphan files and missing references without deleting automatically. Content deduplication never erases separate source/provenance relationships. Trash is soft-delete; assets referenced by any live revision/version/export cannot be purged. Back up DB and referenced files consistently.

## Workflow abstraction

Semantic manifest example (design only, disabled until evidence exists):

```json
{
  "schemaVersion": 1,
  "id": "image.generate.klein",
  "version": "1.0.0",
  "tasks": ["generate"],
  "modelFamily": "klein",
  "graphPath": "graphs/klein-generate.api.json",
  "graphSha256": "<computed when graph exists>",
  "bindings": {
    "prompt": {"title": "DR_PROMPT", "input": "text", "type": "string"},
    "seed": {"title": "DR_SEED", "input": "seed", "type": "integer"}
  },
  "outputs": [{"title": "DR_OUTPUT", "kind": "image", "alpha": false}],
  "requirements": {"nodes": [], "models": []},
  "limits": {"maxReferences": 0, "maxPixels": 1048576},
  "validationEvidenceId": null,
  "enabled": false
}
```

Real manifests must enumerate nonempty required classes, model filenames/hashes/source/licence metadata, allowed input ranges, dimensions/multiples and expected output contracts. Compile by resolving unique semantic `_meta.title` labels to actual graph node IDs at runtime. Numeric IDs exist only in adapter output, never product logic. Duplicate/missing labels, input/type mismatch or stale graph hashes fail before queueing. Validate against engine `/object_info`, available model dropdowns and current engine fingerprint. Validate output count, MIME, dimensions and alpha; preserve exact submitted graph, prompt and seed in provenance. A structurally valid manifest is not visually validated.

## Routing and prompt intent

Central `routing` package accepts task, user intent, reference roles/count, fidelity constraints, selection, quality, dimensions, model override and current capabilities. Filter by task/model readiness, reference/size limits, verified output requirements and relevant visual evidence. Then use versioned task-specific rules and measured fidelity/latency/VRAM to rank eligible workflows. Return chosen manifest/version, explanation, evidence IDs and rejection reasons. No eligible route means actionable setup/error; never silently switch to an incompatible model. Override still obeys readiness and safety contracts.

Legacy QA is provisional evidence: Klein for quick iteration, Qwen for identity-sensitive references and faithful edits; verify on current graphs and golden set before enabling. Speed tables alone do not establish quality. Conflicting or stale evidence requires review. Store exact user prompt separately from any proposed enhancement and accepted revision. No automatic rewrite that changes intent.

## Engine, jobs and recovery

Discover an explicitly configured loopback Desktop endpoint or bounded loopback candidates from Desktop configuration. Verify `/system_stats` installation identity and `/object_info`; port 8188 alone is insufficient. Cache engine capabilities by fingerprint and invalidate after reconnect/update. Do not edit ComfyUI installations or generated configuration. Distinguish installed, missing, optional and installed-but-unvalidated.

One active GPU job per workstation. Persist queued intent before submission; enforce idempotency. States: queued → validating → submitting → running → collecting → succeeded; alternatives failed/cancelled/interrupted. Unknown submission acknowledgement becomes uncertain, reconciled by engine prompt/client metadata; never blindly resubmit. Engine execution success produces review candidates, not automatic master changes.

Use engine WebSocket progress internally, durable SSE outward with sequence IDs, heartbeat and Last-Event-ID replay. Progress is indeterminate when no denominator exists. Timeouts distinguish connection, queue wait, active silence and output collection; thresholds are configurable from observed timings. On restart reconcile prompt IDs with history/queue. If absent, mark interrupted with a retry action retaining settings; do not invent completion or resume an unrecoverable diffusion state.

Cancellation of queued work is local. Active interrupt/free can affect other ComfyUI clients: issue only when engine ownership is verified, otherwise report the limitation and avoid global interference. At safe idle family changes, release only owned workloads/models using validated engine behaviour. Prefer tiled decode when proven on current graph. Output import must finish before marking success. Backpressure limits pending jobs; four variations can run serially to fit VRAM.

## API and local access

Planned endpoints: GET `/api/health`, `/api/setup`, `/api/events`; POST `/api/setup/connection`; GET/POST `/api/projects`; POST `/api/assets` and GET `/api/assets/:id`; GET `/api/projects/:id/assets`; GET/POST `/api/projects/:id/documents`; GET/PATCH `/api/documents/:id` (expectedRevision required); POST `/api/documents/:id/versions`; POST `/api/jobs`; GET `/api/jobs/:id`; POST `/api/jobs/:id/cancel`. Phase 1 demonstrates contracts/infrastructure, not broad edit operations.

Bind HTTP server to loopback, validate Host/Origin and use a per-session mutation token so unrelated websites cannot command local models. Disable permissive CORS. Asset IDs resolve to backend-owned relative paths; reject traversal, arbitrary filesystem URLs, oversize uploads and malformed decoded images. No browser-configurable remote fetch proxy. Sanitize imported SVG before future use. Errors are structured and redact private paths where unnecessary. Raw user images, prompts, tokens and model weights do not enter telemetry or GitHub. No cloud generation fallback.

## Validation strategy

Unit: document invariants, prompt preservation, semantic binding, route eligibility/explanations and state transitions. Integration: real SQLite migrations/constraints, atomic asset writes/recovery, upload rejection, idempotency, SSE replay, engine restart/unknown submission using a controlled fake engine. Browser: navigation, import, setup failures and visible save/job state, keyboard/focus/accessibility. Real engine: installation fingerprint, node/model preflight, one minimal image run, output import and restart reconciliation. AI QA uses outcome rubrics and saved visual evidence; network or API success never counts as fidelity proof.

Phase 1 CI must run unit/integration, strict TypeScript, production build and relevant Playwright tests. Separate manual/opt-in GPU tests and visual assessment; CI cannot claim them from mock runs. Pin engine/model/graph/hardware fingerprints with every benchmark. See build plan for gates and golden set coverage.
