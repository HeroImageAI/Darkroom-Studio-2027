# Legacy Darkroom — read-only lessons

Inspected through GitHub on 16 October 2026. No writes were made to HeroImageAI/Darkroom. This is a bounded review of selected documentation and the manifest type, not an exhaustive code audit or independent rerun.

Repository tree inspected at commit `768911a59a8da4de31557a2df04c0cfd2a91b005`. Initial audit/benchmark/handover reads used the default branch; their observed blob SHAs below make those readings reproducible.

| Source | Observed blob SHA |
| --- | --- |
| [AUDIT.md](https://github.com/HeroImageAI/Darkroom/blob/main/AUDIT.md) | 6ecd87a31886bfe63e6dc0c6811d3c95b30fbf4b |
| [BENCHMARKS.md](https://github.com/HeroImageAI/Darkroom/blob/main/BENCHMARKS.md) | 4b2fa06604c6def0facd9a07e88b59ac3b8f242b |
| [HANDOVER.md](https://github.com/HeroImageAI/Darkroom/blob/main/HANDOVER.md) | e7cf10a30c9aeb307d0f07442a66bd836878b5dc |
| [ADDENDA_REPORT.md](https://github.com/HeroImageAI/Darkroom/blob/768911a59a8da4de31557a2df04c0cfd2a91b005/docs/qa/ADDENDA_REPORT.md) | 5622721dedb1c5e48576aebc0ee8d34b687dfa3a |
| [src/shared/manifest.ts](https://github.com/HeroImageAI/Darkroom/blob/768911a59a8da4de31557a2df04c0cfd2a91b005/src/shared/manifest.ts) | 3970847a36f19576c57e76a8372d1cbb63e6b5db |

## Adopt as lessons, revalidate before enabling

- Desktop may change port and multiple engines may exist. Audit reports a second server occupying 8188. Verify installation identity rather than trusting the first responding port; this avoids submitting private images to the wrong local project.
- Benchmarks distinguish cold/warm runs. Klein 1024² was about 8 s warm and 14 s cold; Qwen generation was slower at different dimensions/settings. These are historical measurements, not matched-resolution quality comparisons or new-app performance promises.
- Historical whole-GPU usage approached 20–25 GB on a 24 GB card. Use a single GPU worker, safe model-family transitions and tiled decode. The benchmark includes a long stalled decode/queue case; report active versus queue wait separately.
- Per-feature QA recommended Klein for rapid iteration and Qwen for reference identity and faithful instructions. Treat these as candidate routing rules tied to exact workflow evidence, not universal statements about models.
- Circle edit reportedly failed on Klein and passed on Qwen. Shared outpaint preparation reportedly produced white areas with Qwen. Operation-specific workflow validation matters more than sharing an attractive abstraction at all costs.
- Texture-transfer tests reportedly found Qwen copying the reference subject; preserve reference roles and explicit fidelity constraints. Do not assume a newer model is best at every task.
- SeedVR2 alpha preservation and extraction workflows deserve dedicated pixel/edge tests. Restore must check identity and colour rather than just sharpness.
- Handover describes node checks after Desktop updates and lost jobs after engine restarts. Persist intent/provenance independently and reconcile, preserving a retry path.
- Legacy manifests combine image and video concerns. Retain the idea of typed capability metadata, but split this product's contracts around image documents and semantic tasks. Do not import video types or the old UI structure.

## Not established by this review

No current model inventory, ComfyUI version, engine endpoint, licence status, GPU availability, visual output quality or benchmark reproduction has been verified. Source reports about installed paths and successful tests remain historical. No golden input/output images were copied or visually inspected in this phase. Model licence claims in legacy files are not current legal verification; setup must record current authoritative sources and the exact weights before making usage representations.

Do not reuse legacy configuration by overwriting files, mutate its database, download weights, alter its environment or bring its node/UI architecture into this repository. Scope reuse only when it directly improves a validated Create/Edit/Finish outcome.
