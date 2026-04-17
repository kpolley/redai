import { z } from "zod";
import { severitySchema } from "./common";

export const threatCategorySchema = z.enum([
  "spoofing",
  "tampering",
  "repudiation",
  "information-disclosure",
  "denial-of-service",
  "elevation-of-privilege",
  "business-logic",
  "supply-chain",
  "privacy",
  "platform-specific",
]);
export type ThreatCategory = z.infer<typeof threatCategorySchema>;

export const architectureSummarySchema = z.object({
  applicationType: z.string(),
  summary: z.string(),
  technologies: z.array(z.string()),
});
export type ArchitectureSummary = z.infer<typeof architectureSummarySchema>;

export const threatAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  sensitivity: z.enum(["low", "medium", "high"]),
});
export type ThreatAsset = z.infer<typeof threatAssetSchema>;

export const trustBoundarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  crossingEntrypoints: z.array(z.string()),
});
export type TrustBoundary = z.infer<typeof trustBoundarySchema>;

export const threatEntrypointSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  location: z.string().optional(),
  description: z.string(),
});
export type ThreatEntrypoint = z.infer<typeof threatEntrypointSchema>;

export const dataFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  destination: z.string(),
  description: z.string(),
  assets: z.array(z.string()),
});
export type DataFlow = z.infer<typeof dataFlowSchema>;

export const threatSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: threatCategorySchema,
  severity: severitySchema,
  likelihood: z.enum(["low", "medium", "high"]),
  affectedAssets: z.array(z.string()),
  entrypoints: z.array(z.string()),
  trustBoundaries: z.array(z.string()),
  rationale: z.string(),
  validationIdeas: z.array(z.string()),
});
export type Threat = z.infer<typeof threatSchema>;

export const validationFocusAreaSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  preferredValidators: z.array(z.enum(["browser", "ios-simulator"])),
});
export type ValidationFocusArea = z.infer<typeof validationFocusAreaSchema>;

export const threatModelSchema = z.object({
  id: z.string(),
  runId: z.string(),
  generatedAt: z.string(),
  summary: z.string(),
  architecture: architectureSummarySchema,
  assets: z.array(threatAssetSchema),
  trustBoundaries: z.array(trustBoundarySchema),
  entrypoints: z.array(threatEntrypointSchema),
  dataFlows: z.array(dataFlowSchema),
  assumptions: z.array(z.string()),
  threats: z.array(threatSchema),
  recommendedFocusAreas: z.array(validationFocusAreaSchema),
  transcriptRef: z.string().optional(),
});
export type ThreatModel = z.infer<typeof threatModelSchema>;
