export type Corner = { x: number; y: number };
// Inverse sample a destination unit square into a convex source quadrilateral.
// Corners follow the visible artwork: top-left, top-right, bottom-right, bottom-left.
export function perspectiveMap(
  corners: Corner[],
  width: number,
  height: number,
) {
  if (
    corners.length !== 4 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2
  )
    throw Error("Choose four artwork corners and valid source dimensions");
  if (
    corners.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > width - 1 ||
        p.y > height - 1,
    )
  )
    throw Error("Keep all four artwork corners inside the image");
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!,
      b = corners[(i + 1) % 4]!,
      c = corners[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross <= 1e-4)
      throw Error(
        "Mark a convex outline clockwise: top-left, top-right, bottom-right, bottom-left",
      );
  }
  const [p0, p1, p2, p3] = corners as [Corner, Corner, Corner, Corner];
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8)
    throw Error("The artwork outline is too narrow to straighten");
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y;
  // A pole inside the output would fold/invert the sampled image.
  if ([1, 1 + g, 1 + h, 1 + g + h].some((v) => v <= 1e-8))
    throw Error("The artwork perspective is too extreme; adjust the corners");
  return (u: number, v: number) => {
    const denominator = g * u + h * v + 1;
    return {
      x: (a * u + b * v + p0.x) / denominator,
      y: (d * u + e * v + p0.y) / denominator,
    };
  };
}

export function straightenRgba(
  source: Uint8Array,
  width: number,
  height: number,
  corners: Corner[],
  outWidth: number,
  outHeight: number,
) {
  if (
    !Number.isInteger(outWidth) ||
    !Number.isInteger(outHeight) ||
    outWidth < 2 ||
    outHeight < 2 ||
    outWidth > 8192 ||
    outHeight > 8192 ||
    outWidth * outHeight > 16_000_000
  )
    throw Error(
      "Artwork output supports 2–8192 pixels per side and up to 16 million pixels",
    );
  if (source.length !== width * height * 4)
    throw Error("Artwork source must contain RGBA pixels");
  const map = perspectiveMap(corners, width, height);
  const output = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++)
    for (let x = 0; x < outWidth; x++) {
      const p = map(x / (outWidth - 1), y / (outHeight - 1));
      const sx = Math.max(0, Math.min(width - 1, p.x)),
        sy = Math.max(0, Math.min(height - 1, p.y));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1);
      const tx = sx - x0,
        ty = sy - y0,
        out = (y * outWidth + x) * 4;
      const offsets = [
        (y0 * width + x0) * 4,
        (y0 * width + x1) * 4,
        (y1 * width + x0) * 4,
        (y1 * width + x1) * 4,
      ];
      const weights = [
        (1 - tx) * (1 - ty),
        tx * (1 - ty),
        (1 - tx) * ty,
        tx * ty,
      ];
      if (tx < 1e-10 && ty < 1e-10) {
        output.set(source.subarray(offsets[0]!, offsets[0]! + 4), out);
        continue;
      }
      let alpha = 0;
      for (let i = 0; i < 4; i++)
        alpha += source[offsets[i]! + 3]! * weights[i]!;
      output[out + 3] = Math.round(alpha);
      if (alpha > 0)
        for (let ch = 0; ch < 3; ch++) {
          let premultiplied = 0;
          for (let i = 0; i < 4; i++)
            premultiplied +=
              source[offsets[i]! + ch]! *
              source[offsets[i]! + 3]! *
              weights[i]!;
          output[out + ch] = Math.round(premultiplied / alpha);
        }
    }
  return output;
}
