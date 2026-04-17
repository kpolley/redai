import { z } from "zod";
import { artifactSchema } from "./artifact";
import { confidenceSchema } from "./common";

export const validationPlanSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  validatorId: z.string(),
  goal: z.string(),
  steps: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ValidationPlan = z.infer<typeof validationPlanSchema>;

export const validationJobSchema = z.object({
  id: z.string(),
  runId: z.string(),
  findingId: z.string(),
  validatorId: z.string(),
  plan: validationPlanSchema,
});
export type ValidationJob = z.infer<typeof validationJobSchema>;

export const validationJobStateSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  validatorId: z.string(),
  status: z.enum(["queued", "running", "completed", "error"]),
  appUrl: z.string().optional(),
  profilePath: z.string().optional(),
  agentBrowserHome: z.string().optional(),
  simulatorUdid: z.string().optional(),
  simulatorName: z.string().optional(),
  trace: z.array(z.string()).default([]),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});
export type ValidationJobState = z.infer<typeof validationJobStateSchema>;

export const validationResultSchema = z.object({
  findingId: z.string(),
  status: z.enum(["confirmed", "not-exploitable", "unable-to-test", "error"]),
  confidence: confidenceSchema,
  summary: z.string(),
  reproductionSteps: z.array(z.string()),
  payloadsTried: z.array(z.string()),
  evidence: z.array(artifactSchema),
  agentTranscriptRef: z.string().optional(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;
