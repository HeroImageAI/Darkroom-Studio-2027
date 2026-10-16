import { z } from "zod";

export const exportRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevision: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    format: z.enum(["png", "jpeg"]),
    width: z.number().int().min(1).max(16384),
    height: z.number().int().min(1).max(16384),
    transparent: z.boolean(),
    background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    quality: z.number().int().min(1).max(100),
    density: z.number().int().min(72).max(600),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.width * r.height > 40000000)
      ctx.addIssue({
        code: "custom",
        message: "Export is limited to 40 million pixels.",
      });
    if (r.format === "jpeg" && r.transparent)
      ctx.addIssue({
        code: "custom",
        message:
          "JPEG requires an explicit background; choose PNG for transparency.",
      });
  });
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export const finishRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevision: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    task: z.enum(["Restore", "Upscale", "Remove background"]),
    width: z.number().int().min(256).max(2048),
    height: z.number().int().min(256).max(2048),
  })
  .strict()
  .refine((r) => r.width * r.height <= 4194304, {
    message: "AI Finish is currently limited to 4,194,304 pixels.",
  });
export type FinishRequest = z.infer<typeof finishRequestSchema>;
export type ExportRecord = {
  id: string;
  documentId: string;
  revisionId: string;
  assetId: string;
  filename: string;
  sha256: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  transparent: boolean;
  createdAt: string;
};
