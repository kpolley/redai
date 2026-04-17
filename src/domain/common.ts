import { z } from "zod";

export const severitySchema = z.enum(["info", "low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof severitySchema>;

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const runStatusSchema = z.enum([
  "draft",
  "queued",
  "scanning",
  "planning-validation",
  "validating",
  "cancel-pending",
  "completed",
  "failed",
  "canceled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const findingValidationStatusSchema = z.enum([
  "not-planned",
  "planned",
  "queued",
  "validating",
  "confirmed",
  "not-exploitable",
  "unable-to-test",
  "error",
]);
export type FindingValidationStatus = z.infer<typeof findingValidationStatusSchema>;
