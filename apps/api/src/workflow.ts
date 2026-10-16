import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Graph,
  Manifest,
} from "../../../packages/workflows/src/manifest.js";
export const graph = JSON.parse(
  readFileSync(resolve("workflows/graphs/klein-foundation.json"), "utf8"),
) as Graph;
export const manifest = JSON.parse(
  readFileSync(resolve("workflows/manifests/klein-foundation.json"), "utf8"),
) as Manifest;
export interface Workflow {
  manifest: Manifest;
  graph: Graph;
}
const ids = JSON.parse(
  readFileSync(resolve("workflows/create-index.json"), "utf8"),
) as string[];
export const workflows: Workflow[] = ids.map((id) => ({
  manifest: JSON.parse(
    readFileSync(resolve("workflows/manifests", id + ".json"), "utf8"),
  ),
  graph: JSON.parse(
    readFileSync(resolve("workflows/graphs", id + ".json"), "utf8"),
  ),
}));
export function workflowById(id: string) {
  const found = workflows.find((w) => w.manifest.id === id);
  if (!found) throw Error("Workflow is no longer installed");
  return found;
}
