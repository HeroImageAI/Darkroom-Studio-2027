import { createHash } from "node:crypto";
import type { Graph, Manifest, ObjectInfo } from "./manifest.js";
export const graphHash = (graph: Graph) =>
  createHash("sha256").update(JSON.stringify(graph)).digest("hex");
export function byTitle(graph: Graph, title: string) {
  const matches = Object.entries(graph).filter(
    ([, n]) => n._meta.title === title,
  );
  if (matches.length !== 1)
    throw Error(`Expected one ${title} node; found ${matches.length}`);
  return matches[0]!;
}
export function bind(
  graph: Graph,
  manifest: Manifest,
  values: Record<string, string | number>,
): Graph {
  if (graphHash(graph) !== manifest.graphSha256)
    throw Error("Workflow graph hash mismatch");
  const copy = structuredClone(graph);
  for (const [key, value] of Object.entries(values)) {
    const b = manifest.bindings[key];
    if (!b) throw Error(`Unknown workflow input ${key}`);
    if (
      b.type === "integer"
        ? !Number.isSafeInteger(value)
        : typeof value !== "string"
    )
      throw Error(`Invalid ${key}`);
    const [, node] = byTitle(copy, b.title);
    if (!(b.input in node.inputs))
      throw Error(`Missing binding input ${b.input}`);
    node.inputs[b.input] = value;
  }
  return copy;
}
export function preflight(graph: Graph, manifest: Manifest, info: ObjectInfo) {
  if (graphHash(graph) !== manifest.graphSha256)
    throw Error("Workflow graph hash mismatch");
  for (const b of Object.values(manifest.bindings)) {
    const [, n] = byTitle(graph, b.title);
    if (!(b.input in n.inputs))
      throw Error(`Missing semantic input ${b.title}.${b.input}`);
  }
  for (const out of manifest.outputs) byTitle(graph, out.title);
  for (const [id, n] of Object.entries(graph)) {
    const spec = info[n.class_type];
    if (!spec) throw Error(`Missing node class ${n.class_type}`);
    const all = { ...spec.input.required, ...spec.input.optional };
    for (const required of Object.keys(spec.input.required ?? {}))
      if (!(required in n.inputs))
        throw Error(`Missing required input ${n.class_type}.${required}`);
    for (const [key, value] of Object.entries(n.inputs)) {
      const type = all[key]?.[0];
      if (!type) throw Error(`Unknown node input ${n.class_type}.${key}`);
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        typeof value[1] === "number"
      ) {
        const source = graph[value[0]];
        if (!source) throw Error(`Missing graph link ${id}.${key}`);
        const output = info[source.class_type]?.output?.[value[1]];
        if (
          !output ||
          (typeof type === "string" && output !== type && type !== "*")
        )
          throw Error(`Incompatible graph link ${id}.${key}`);
      } else if (Array.isArray(type)) {
        if (!type.includes(value))
          throw Error(
            `Unavailable option/model ${n.class_type}.${key}: ${value}`,
          );
      } else if (
        (type === "STRING" && typeof value !== "string") ||
        (type === "INT" && !Number.isSafeInteger(value)) ||
        (type === "FLOAT" && typeof value !== "number")
      )
        throw Error(`Wrong input type ${id}.${key}`);
    }
  }
  for (const m of manifest.models) {
    const [, n] = byTitle(graph, m.title);
    if (n.inputs[m.input] !== m.filename)
      throw Error("Model manifest mismatch");
  }
  return {
    ready: true,
    classes: [...new Set(Object.values(graph).map((n) => n.class_type))],
  };
}
