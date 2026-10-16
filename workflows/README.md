# Semantic image workflows

Phase 1 contains one small Klein text-to-image graph, independently assembled from core node contracts after reading the legacy graph for lessons. Filenames were checked against the current engine; no legacy graph files or UI were imported wholesale.

The graph uses named semantic nodes; product code resolves titles rather than depending on node IDs. The manifest pins its content hash and records model source/licence-review status. The validated route is scoped to a foundation generation test, not all image tasks. Auto does not yet rank multiple model families. Engine/capability fingerprint changes invalidate readiness.

Run `npm run check:workflows` after an engine update. `scripts/live-foundation.ts` runs an explicit local GPU smoke test and saves local evidence, but does not automatically enable routing. Enable only after inspecting actual output and recording the corresponding validation fingerprint/evidence. Regenerating the graph script resets validation, deliberately requiring review again.

No model downloads occur. Missing or mismatched models fail preflight. Existing weights are not deleted or modified. Full weight-content hashing and verified source/licence inventory are still hardening tasks; filename/capability readiness is not a licence statement.
