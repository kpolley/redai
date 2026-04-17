import { z } from "zod";

export const scanTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source-directory"), path: z.string() }),
  z.object({ kind: z.literal("website"), url: z.string().url() }),
  z.object({ kind: z.literal("ios-app"), path: z.string() }),
]);
export type ScanTarget = z.infer<typeof scanTargetSchema>;
