"""Isolated checkpoint experiment; never changes ComfyUI or enabled app routes."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import VitMatteForImageMatting, VitMatteImageProcessor

root = Path("data/quality-gaps/glass-matting")
model_path = Path("data/quality-gaps/vitmatte-small")
model_sha = hashlib.sha256((model_path / "model.safetensors").read_bytes()).hexdigest()
assert model_sha == "bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb"
torch.set_num_threads(4)
device = "cuda" if torch.cuda.is_available() else "cpu"
processor = VitMatteImageProcessor.from_pretrained(model_path, local_files_only=True)
model = VitMatteForImageMatting.from_pretrained(model_path, local_files_only=True, use_safetensors=True).eval().to(device)
trimap = Image.new("L", (384, 512), 0)
draw = ImageDraw.Draw(trimap)
# Manual approximate silhouette/uncertain region, not the truth alpha values.
draw.polygon([(156, 32), (228, 32), (228, 180), (284, 224), (284, 480), (100, 480), (100, 224), (156, 180)], fill=128)
draw.rectangle((168, 44, 212, 62), fill=255)
draw.rectangle((144, 304, 239, 355), fill=255)
trimap.save(root / "manual-trimap.png")
expected = np.asarray(Image.open(root / "truth.png").convert("RGBA"))[:, :, 3]
runs = []
for name in ("white", "blue"):
    source = Image.open(root / f"{name}.source.png").convert("RGB")
    inputs = processor(images=source, trimaps=trimap, return_tensors="pt").to(device)
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
    start = time.monotonic()
    with torch.inference_mode():
        alpha = model(**inputs).alphas[0, 0].clamp(0, 1)
    if device == "cuda":
        torch.cuda.synchronize()
    elapsed = time.monotonic() - start
    predicted = (alpha.cpu().numpy() * 255).round().astype(np.uint8)[:512, :384]
    Image.fromarray(predicted).save(root / f"{name}.vitmatte-mask.png")
    rgba = np.dstack((np.asarray(source), predicted))
    Image.fromarray(rgba).save(root / f"{name}.vitmatte-result.png")
    interior = predicted[240:280, 142:240].astype(float)
    target = expected[240:280, 142:240].astype(float)
    report = dict(name=name, seconds=elapsed, device=device,
                  peakAllocatedBytes=torch.cuda.max_memory_allocated() if device == "cuda" else None,
                  predictedInteriorAlpha=float(interior.mean()), expectedInteriorAlpha=float(target.mean()),
                  interiorAlphaMae=float(np.abs(interior-target).mean()),
                  labelAlpha=float(predicted[304:356, 144:240].mean()), visualReview="pending")
    runs.append(report)
    print(json.dumps(report), flush=True)
report = dict(model="hustvl/vitmatte-small-composition-1k", revision="6a58ad7646403c1df626fbd746900aec7361ea1d",
              modelSha256=model_sha, checkpointBytes=103294572, torch=torch.__version__,
              scope="Manual trimap on a controlled synthetic fixture; alpha only, no foreground colour estimation; no route enabled.", runs=runs)
(root / "vitmatte-runs.json").write_text(json.dumps(report, indent=2) + "\n")
