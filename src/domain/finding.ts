import { z } from "zod";
import { artifactKindSchema } from "./artifact";
import { confidenceSchema, findingValidationStatusSchema, severitySchema } from "./common";

export const affectedLocationSchema = z.object({
  path: z.string(),
  line: z.number().int().positive().optional(),
  symbol: z.string().optional(),
  description: z.string().optional(),
});
export type AffectedLocation = z.infer<typeof affectedLocationSchema>;

export const validationNotesSchema = z.object({
  suspectedVulnerability: z.string(),
  exploitabilityReasoning: z.string(),
  relevantPaths: z.array(z.string()),
  preconditions: z.array(z.string()),
  confirmationActions: z.array(z.string()),
  successCriteria: z.array(z.string()),
  disproofCriteria: z.array(z.string()),
  usefulArtifacts: z.array(artifactKindSchema),
});
export type ValidationNotes = z.infer<typeof validationNotesSchema>;

export const findingSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  severity: severitySchema,
  confidence: confidenceSchema,
  affectedLocations: z.array(affectedLocationSchema),
  evidence: z.array(z.string()),
  attackScenario: z.string(),
  remediation: z.string(),
  validationStatus: findingValidationStatusSchema.default("not-planned"),
  validationNotes: validationNotesSchema,
});
export type Finding = z.infer<typeof findingSchema>;
