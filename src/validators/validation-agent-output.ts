import { z } from "zod";
import type { Artifact, ValidationJob, ValidationResult } from "../domain";

export const validationAgentEvidenceSchema = z.object({
  kind: z
    .enum(["screenshot", "log", "http-response", "agent-transcript", "file", "note"])
    .default("note"),
  title: z.string().default("Validation evidence"),
  path: z.string().default(""),
  contentType: z.string().default(""),
  summary: z.string().default(""),
});

export const validationAgentOutputSchema = z.object({
  findingId: z.string().default(""),
  status: z
    .enum(["confirmed", "not-exploitable", "unable-to-test", "error"])
    .default("unable-to-test"),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  summary: z.string().default("Validator did not provide a summary."),
  reproductionSteps: z.array(z.string()).default([]),
  payloadsTried: z.array(z.string()).default([]),
  evidence: z.array(validationAgentEvidenceSchema).default([]),
  agentTranscriptRef: z.string().default(""),
});
export type ValidationAgentOutput = z.infer<typeof validationAgentOutputSchema>;

export function normalizeValidationAgentOutput(
  job: ValidationJob,
  output: ValidationAgentOutput,
  transcriptArtifact?: Artifact,
): ValidationResult {
  const evidence: Artifact[] = output.evidence.map((item) => ({
    id: crypto.randomUUID(),
    kind: item.kind,
    title: item.title,
    createdAt: new Date().toISOString(),
    ...(item.path ? { path: item.path } : {}),
    ...(item.contentType ? { contentType: item.contentType } : {}),
    ...(item.summary ? { summary: item.summary } : {}),
  }));
  if (transcriptArtifact) evidence.push(transcriptArtifact);

  return {
    findingId: job.findingId,
    status: output.status,
    confidence: output.confidence,
    summary: output.summary,
    reproductionSteps: output.reproductionSteps,
    payloadsTried: output.payloadsTried,
    evidence,
    ...(output.agentTranscriptRef || transcriptArtifact
      ? { agentTranscriptRef: output.agentTranscriptRef ?? transcriptArtifact?.path }
      : {}),
  };
}
