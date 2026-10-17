import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export function canvasSignature() {
  const hash = createHash("sha256");
  for (const path of [
    "apps/api/src/branding.ts",
    "apps/api/src/raster-render.ts",
    "packages/document/src/svg.ts",
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
    "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff",
  ])
    hash.update(readFileSync(path));
  return hash.digest("hex");
}
