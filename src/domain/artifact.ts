import { z } from "zod";

export const artifactKindSchema = z.enum([
  "screenshot",
  "log",
  "http-response",
  "agent-transcript",
  "file",
  "note",
]);
export type ArtifactKind = z.infer<typeof artifactKindSchema>;

export const artifactSchema = z.object({
  id: z.string(),
  kind: artifactKindSchema,
  title: z.string(),
  path: z.string().optional(),
  contentType: z.string().optional(),
  summary: z.string().optional(),
  createdAt: z.string(),
});
export type Artifact = z.infer<typeof artifactSchema>;
