export interface GraphNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta: { title: string };
}
export type Graph = Record<string, GraphNode>;
export interface Manifest {
  schemaVersion: 1;
  id: string;
  version: string;
  modelFamily: "Klein" | "Qwen";
  graphSha256: string;
  bindings: Record<
    string,
    { title: string; input: string; type: "string" | "integer" }
  >;
  outputs: { title: string; kind: "image"; alpha: boolean }[];
  models: {
    sha256?: string;
    title: string;
    input: string;
    filename: string;
    source: string;
    licenceStatus: string;
  }[];
  maxPixels: number;
  validationEvidenceId: string | null;
  validationFingerprint?: string | null;
  enabled: boolean;
}
export type ObjectInfo = Record<
  string,
  {
    input: {
      required?: Record<string, unknown[]>;
      optional?: Record<string, unknown[]>;
    };
    output?: string[];
  }
>;
