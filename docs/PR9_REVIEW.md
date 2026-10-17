# PR #9 review and corrective follow-up

Reviewed against merge base `5166a47`, with particular attention to straight/premultiplied alpha, protected pixels, input/output size changes and validation gates. No merge was requested or performed.

## Findings corrected

1. **Faint-alpha discontinuity.** Switching from unchanged source RGB to recovered model RGB abruptly at alpha 32 could create a visible step. Recovery now blends continuously from source to recovered colour over alpha 32–64. A full alpha-ramp regression bounds adjacent composited-pixel changes.
2. **Repeated unpremultiplication after resize.** `finishOutput` reused Sharp output metadata as raw-input options. The output `premultiplied` flag describes resize processing; the returned raw buffer is straight RGBA. Passing that flag into the encoder amplified translucent RGB again. Both encoders now declare only dimensions and four channels. Real 2x resize tests at alpha 64, 128 and 192 catch this error; same-size identity tests did not.

The second issue explains much of the previously attributed Upscale colour shift. On retained GPU outputs, synthetic translucent colour MAE falls from approximately 31.9 to 3.0; the photographic cutout falls from approximately 45.2 to 20.3. Alpha remains exact. Twelve historical raster/finishing parity cases still pass. Broader photographic fidelity is not established by these metrics.

## Preview recovery

Tool policy rejected stopping the previous preview process despite explicit user restart authorization. A consistent SQLite backup and immutable-asset copy were used for an isolated replacement, after verifying there were no active jobs. No two preview processes share its working database. The saved title, source, selection and unaccepted candidate survived. The old process was not stopped.

## Scope

Only the two finishing correctness fixes change production behaviour in this review. Garment annotations, model comparisons and isolated Python candidates are opt-in QA. No alternate selection, colour method, restoration model or matting route was enabled. The two small candidate checkpoints remain in ignored workspace storage; ComfyUI model folders and Python packages were not changed. See `QUALITY_FOLLOWUP.md` for the results of tasks 1–3.

Current tests and cross-platform CI are recorded in PR #9. Review does not authorize merging or advancing Library expansion.
