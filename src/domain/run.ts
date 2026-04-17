import { z } from "zod";
import { runActivitySchema } from "./activity";
import { analysisUnitResultSchema, analysisUnitSchema } from "./analysis-unit";
import { artifactSchema } from "./artifact";
import { runStatusSchema } from "./common";
import { filePrioritizationSchema } from "./file-prioritization";
import { findingSchema } from "./finding";
import { runSettingsSchema } from "./run-settings";
import { scanTargetSchema } from "./target";
import { threatModelSchema } from "./threat-model";
import {
  validationJobStateSchema,
  validationPlanSchema,
  validationResultSchema,
} from "./validation";

export const scanRunSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: scanTargetSchema,
  settings: runSettingsSchema,
  status: runStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScanRun = z.infer<typeof scanRunSchema>;

export const runStageIdSchema = z.enum([
  "threat-model",
  "file-prioritization",
  "analysis-discovery",
  "unit-scanning",
  "finding-aggregation",
  "validation",
  "reporting",
]);
export type RunStageId = z.infer<typeof runStageIdSchema>;

export const runStageStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "canceled",
]);
export type RunStageStatus = z.infer<typeof runStageStatusSchema>;

export const runStageStateSchema = z.object({
  id: runStageIdSchema,
  label: z.string(),
  status: runStageStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  current: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});
export type RunStageState = z.infer<typeof runStageStateSchema>;

export const scanRunStateSchema = z.object({
  run: scanRunSchema,
  stages: z.array(runStageStateSchema).default([]),
  activity: z.array(runActivitySchema),
  threatModel: threatModelSchema.optional(),
  filePrioritization: filePrioritizationSchema.optional(),
  analysisUnits: z.array(analysisUnitSchema),
  analysisUnitResults: z.array(analysisUnitResultSchema),
  artifacts: z.array(artifactSchema),
  findings: z.array(findingSchema),
  validationPlans: z.array(validationPlanSchema),
  validationJobs: z.array(validationJobStateSchema).default([]),
  validationResults: z.array(validationResultSchema),
});
export type ScanRunState = z.infer<typeof scanRunStateSchema>;

export type ScanRunSummary = ScanRun & {
  findingCount: number;
  confirmedCount: number;
};
