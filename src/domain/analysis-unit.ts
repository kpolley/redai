import { z } from "zod";
import { affectedLocationSchema } from "./finding";

export const sourceLanguageSchema = z.enum([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "swift",
  "go",
  "python",
  "json",
  "unknown",
]);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

export const codeSymbolKindSchema = z.enum([
  "function",
  "method",
  "class",
  "struct",
  "interface",
  "route-handler",
  "module",
]);
export type CodeSymbolKind = z.infer<typeof codeSymbolKindSchema>;

export const codeSymbolSchema = z.object({
  id: z.string(),
  kind: codeSymbolKindSchema,
  name: z.string(),
  language: sourceLanguageSchema,
  location: affectedLocationSchema,
  signature: z.string().optional(),
});
export type CodeSymbol = z.infer<typeof codeSymbolSchema>;

export const analysisUnitKindSchema = z.enum([
  "function",
  "method",
  "class",
  "entrypoint",
  "file",
  "threat-focus",
]);
export type AnalysisUnitKind = z.infer<typeof analysisUnitKindSchema>;

export const analysisUnitSchema = z.object({
  id: z.string(),
  kind: analysisUnitKindSchema,
  title: z.string(),
  language: sourceLanguageSchema,
  location: affectedLocationSchema,
  relatedFiles: z.array(z.string()),
  relatedEntrypoints: z.array(z.string()),
  relatedThreats: z.array(z.string()),
  contextSummary: z.string(),
});
export type AnalysisUnit = z.infer<typeof analysisUnitSchema>;

export const analysisUnitResultSchema = z.object({
  unitId: z.string(),
  status: z.enum(["completed", "failed"]),
  summary: z.string(),
  securityObservations: z.array(z.string()),
  candidateFindingIds: z.array(z.string()),
  followUpUnitIds: z.array(z.string()),
  transcriptRef: z.string().optional(),
  error: z.string().optional(),
});
export type AnalysisUnitResult = z.infer<typeof analysisUnitResultSchema>;
