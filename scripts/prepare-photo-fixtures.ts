// Opt-in public/owned QA fixture preparation; never called by the product.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "data/scope-qa";
mkdirSync(root, { recursive: true });
const { sources } = JSON.parse(
  readFileSync("tests/golden/photo-sources.json", "utf8"),
);
for (const source of sources) {
  const path = root + "/" + source.filename;
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  if (existsSync(path) && hash(readFileSync(path)) === source.sha256) continue;
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error("Fixture download failed: " + source.filename);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10000000 || hash(bytes) !== source.sha256)
    throw Error("Fixture size/checksum mismatch: " + source.filename);
  writeFileSync(path, bytes);
  console.log("Prepared " + source.filename);
}
