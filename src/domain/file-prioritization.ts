import { z } from "zod";

export const filePriorityCategorySchema = z.enum([
  "entrypoint",
  "auth",
  "data-access",
  "input-handling",
  "crypto",
  "configuration",
  "trust-boundary",
  "third-party-integration",
  "other",
]);
export type FilePriorityCategory = z.infer<typeof filePriorityCategorySchema>;

export const filePrioritySchema = z.object({
  path: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  category: filePriorityCategorySchema.optional(),
});
export type FilePriority = z.infer<typeof filePrioritySchema>;

export const filePrioritizationSchema = z.object({
  generatedAt: z.string(),
  totalFiles: z.number().int().nonnegative(),
  prioritized: z.array(filePrioritySchema),
  excluded: z.array(z.string()).default([]),
  notes: z.string().default(""),
  transcriptRef: z.string().optional(),
});
export type FilePrioritization = z.infer<typeof filePrioritizationSchema>;
