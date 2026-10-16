import { z } from "zod";
export const intentSchema = z
  .object({
    prompt: z
      .string()
      .min(1)
      .max(12000)
      .refine((s) => s.trim().length > 0),
    width: z.number().int().min(256).max(1536).multipleOf(16),
    height: z.number().int().min(256).max(1536).multipleOf(16),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1),
    model: z.enum(["Auto", "Klein", "Qwen"]).default("Auto"),
    quality: z.enum(["Draft", "Final"]).default("Draft"),
    references: z.array(z.string().uuid()).max(3).default([]),
  })
  .strict();
export type Intent = z.infer<typeof intentSchema>;
export type IntentInput = z.input<typeof intentSchema>;
export const createRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    intent: intentSchema,
    variations: z.number().int().min(1).max(4).default(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type CreateRequest = z.infer<typeof createRequestSchema>;
export const aspectDimensions = {
  Square: [1024, 1024],
  Portrait: [832, 1216],
  Landscape: [1216, 832],
  Vertical: [768, 1344],
  Wide: [1344, 768],
} as const;
export function dimensions(
  aspect: keyof typeof aspectDimensions,
  quality: "Draft" | "Final",
) {
  return aspectDimensions[aspect].map((v) =>
    quality === "Draft" ? Math.round((v * 0.75) / 16) * 16 : v,
  ) as [number, number];
}
export interface Candidate {
  id: string;
  jobId: string;
  assetId: string;
  variationIndex: number;
  disposition: "candidate" | "accepted" | "rejected";
  documentId: string | null;
  versionId: string | null;
}
export type JobState =
  | "queued"
  | "validating"
  | "submitting"
  | "running"
  | "collecting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "uncertain";
export interface Asset {
  id: string;
  hash: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  alpha: boolean;
  origin: "import" | "generated";
  createdAt: string;
}
export interface Project {
  id: string;
  name: string;
  createdAt: string;
}
export interface Job {
  batchId?: string | null;
  variationIndex?: number;
  id: string;
  projectId: string;
  intent: Intent;
  state: JobState;
  promptId: string | null;
  error: string | null;
  resultId: string | null;
  createdAt: string;
  provenance: string | null;
}
export interface EngineStatus {
  modelVerificationReason?: string;
  modelFiles?: {
    filename: string;
    sha256: string;
    byteSize: number;
    modifiedMs: number;
  }[];
  connected: boolean;
  verified: boolean;
  version?: string;
  device?: string;
  fingerprint?: string;
  reason?: string;
  url: string;
  models: Record<string, string[]>;
}
