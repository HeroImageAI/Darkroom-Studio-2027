"""Workspace-only SR candidate; no ComfyUI model registration or route changes."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import spandrel
import torch
from PIL import Image

root = Path("data/quality-gaps/realesrgan")
checkpoint = root / "RealESRGAN_x4plus.pth"
sha = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
assert sha == "4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1"
state = torch.load(checkpoint, map_location="cpu", weights_only=True)
state = state.get("params_ema", state.get("params", state))
torch.set_num_threads(4)
device = "cuda" if torch.cuda.is_available() else "cpu"
model = spandrel.ModelLoader().load_from_state_dict(state).to(device).eval()
runs = []
cases = [
    ("graphic-Upscale", "data/quality-gaps/finish-alpha/source.png", 512),
    ("portrait-Upscale", "data/quality-gaps/finish-alpha/portrait/source.png", 512),
    ("degraded-Restore", "data/scope-qa/low-quality-image.before.png", 1024),
]
for name, path, size in cases:
    source = Image.open(path).convert("RGBA")
    source = Image.alpha_composite(Image.new("RGBA", source.size, (128, 128, 128, 255)), source).convert("RGB")
    tensor = torch.from_numpy(np.asarray(source).copy()).permute(2, 0, 1).float().unsqueeze(0).to(device) / 255
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
    started = time.monotonic()
    with torch.inference_mode():
        output = model(tensor).clamp(0, 1)
    if device == "cuda":
        torch.cuda.synchronize()
    seconds = time.monotonic() - started
    pixels = (output[0].permute(1, 2, 0).cpu().numpy() * 255).round().astype(np.uint8)
    Image.fromarray(pixels).resize((size, size), Image.Resampling.LANCZOS).save(root / f"{name}.raw.png")
    report = dict(name=name, sourceHash=hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                  seconds=seconds, device=device, nativeScale=model.scale, outputSize=size,
                  peakAllocatedBytes=torch.cuda.max_memory_allocated() if device == "cuda" else None)
    print(json.dumps(report), flush=True)
    runs.append(report)
(root / "runs.json").write_text(json.dumps(dict(model="RealESRGAN_x4plus", source="https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.0", modelSha256=sha, checkpointBytes=checkpoint.stat().st_size, torch=torch.__version__, spandrel=spandrel.__version__, scope="Native 4x SR followed by requested-size Lanczos resize; prototype only, not an enabled route.", runs=runs), indent=2) + "\n")
