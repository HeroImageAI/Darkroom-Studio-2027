import { z } from "zod";
export const intentSchema = z
  .object({
    prompt: z
      .string()
      .min(1)
      .max(12000)
      .refine((s) => s.trim().length > 0),
    width: z.number().int().min(256).max(1024).multipleOf(16),
    height: z.number().int().min(256).max(1024).multipleOf(16),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1),
    model: z.enum(["Auto", "Klein", "Qwen"]).default("Auto"),
  })
  .strict();
export type Intent = z.infer<typeof intentSchema>;
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
  connected: boolean;
  verified: boolean;
  version?: string;
  device?: string;
  fingerprint?: string;
  reason?: string;
  url: string;
  models: Record<string, string[]>;
}
