import { z } from "zod";
export const editTasks = [
  "Remove",
  "Replace",
  "Recolour",
  "Background",
  "Expand",
  "Instruct",
] as const;
export const editRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevision: z.string().uuid(),
    instruction: z
      .string()
      .min(1)
      .max(8000)
      .refine((s) => s.trim().length > 0),
    area: z.enum(["selection", "outside", "whole"]).default("selection"),
    task: z.enum(editTasks),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 32 - 1),
    expand: z
      .object({
        left: z.number().int().min(0).max(512),
        right: z.number().int().min(0).max(512),
        top: z.number().int().min(0).max(512),
        bottom: z.number().int().min(0).max(512),
      })
      .strict()
      .optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      r.task === "Expand" &&
      (!r.expand || Object.values(r.expand).every((v) => v === 0))
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose how much space to add.",
      });
    if (r.task !== "Expand" && r.expand)
      ctx.addIssue({
        code: "custom",
        message: "Expansion applies only to Expand.",
      });
  });
export type EditRequest = z.infer<typeof editRequestSchema>;
