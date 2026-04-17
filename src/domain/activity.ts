import { z } from "zod";

export const runActivitySchema = z.object({
  id: z.string(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  createdAt: z.string(),
});
export type RunActivity = z.infer<typeof runActivitySchema>;
