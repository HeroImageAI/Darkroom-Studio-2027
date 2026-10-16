# Semantic image workflows

Phase 2 adds eight Create graph variants (Klein/Qwen × 0–3 references) listed in create-index.json. Their validated quality lists are authoritative: Qwen/three-reference/Draft failed the synthetic lighting-guide test and is excluded. Qwen/three-reference/Final passed that test; Auto uses Klein for three-reference Draft. See docs/PHASE_2_REPORT.md. The foundation graph below is retained for its original harness/history, not the current Create routing registry.

Phase 1 contains one small Klein text-to-image graph, independently assembled from core node contracts after reading the legacy graph for lessons. Filenames were checked against the current engine; no legacy graph files or UI were imported wholesale.

The graph uses named semantic nodes; product code resolves titles rather than depending on node IDs. The manifest pins its content hash and records model source/licence-review status. The validated route is scoped to a foundation generation test, not all image tasks. Auto does not yet rank multiple model families. Engine/capability fingerprint changes invalidate readiness.

Run `npm run check:workflows` after an engine update. `scripts/live-foundation.ts` runs an explicit local GPU smoke test and saves local evidence, but does not automatically enable routing. Enable only after inspecting actual output and recording the corresponding validation fingerprint/evidence. Regenerating the graph script resets validation, deliberately requiring review again.

No model downloads occur. Missing or mismatched models fail preflight. Existing weights are not deleted or modified. Required weights are pinned by full SHA-256 content hashes and a file-change-aware cache. Source/licence inventory still needs authoritative review; content/capability readiness is not a licence statement.
