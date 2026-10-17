import { z } from "zod";
export const artworkRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevision: z.string().uuid(),
    corners: z
      .array(
        z
          .object({
            x: z.number().finite().nonnegative(),
            y: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .length(4),
    width: z.number().int().min(2).max(8192),
    height: z.number().int().min(2).max(8192),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (r) => r.width * r.height <= 16_000_000,
    "Artwork output supports up to 16 million pixels",
  );
export type ArtworkRequest = z.infer<typeof artworkRequestSchema>;
export type ArtworkRecord = {
  id: string;
  documentId: string;
  revisionId: string;
  assetId: string;
  width: number;
  height: number;
  sourceHash: string;
  outputHash: string;
  corners: { x: number; y: number }[];
  disposition: "candidate" | "saved" | "rejected";
  savedDocumentId?: string;
  createdAt: string;
};
