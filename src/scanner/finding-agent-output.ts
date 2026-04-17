import { z } from "zod";
import type { Finding } from "../domain";
import { tolerantString, tolerantStringArray } from "./zod-helpers";

const agentAffectedLocationSchema = z.object({
  path: tolerantString.default(""),
  line: z.number().int().nonnegative().default(0),
  symbol: tolerantString.default(""),
  description: tolerantString.default(""),
});

const agentValidationNotesSchema = z.object({
  suspectedVulnerability: tolerantString.default(""),
  exploitabilityReasoning: tolerantString.default(""),
  relevantPaths: tolerantStringArray(),
  preconditions: tolerantStringArray(),
  confirmationActions: tolerantStringArray(),
  successCriteria: tolerantStringArray(),
  disproofCriteria: tolerantStringArray(),
  usefulArtifacts: z
    .array(z.enum(["screenshot", "log", "http-response", "agent-transcript", "file", "note"]))
    .default([]),
});

export const findingAgentOutputSchema = z.object({
  id: tolerantString.default(""),
  title: tolerantString.default(""),
  category: tolerantString.default("other"),
  severity: tolerantString.default("medium"),
  confidence: tolerantString.default("medium"),
  affectedLocations: z.array(agentAffectedLocationSchema).default([]),
  evidence: tolerantStringArray(),
  attackScenario: tolerantString.default(""),
  remediation: tolerantString.default(""),
  validationNotes: agentValidationNotesSchema.default({
    suspectedVulnerability: "",
    exploitabilityReasoning: "",
    relevantPaths: [],
    preconditions: [],
    confirmationActions: [],
    successCriteria: [],
    disproofCriteria: [],
    usefulArtifacts: [],
  }),
});
export type FindingAgentOutput = z.infer<typeof findingAgentOutputSchema>;

export const findingListAgentOutputSchema = z.object({
  findings: z.array(findingAgentOutputSchema).default([]),
});

export function normalizeFindingAgentOutputs(outputs: FindingAgentOutput[]): Finding[] {
  const seenIds = new Set<string>();
  return outputs
    .filter((finding) => finding.title.trim())
    .map((finding) => {
      const id = finding.id && !seenIds.has(finding.id) ? finding.id : crypto.randomUUID();
      seenIds.add(id);
      return {
        id,
        title: finding.title,
        category: finding.category || "other",
        severity: normalizeSeverity(finding.severity),
        confidence: normalizeConfidence(finding.confidence),
        affectedLocations: finding.affectedLocations
          .filter((location) => location.path.trim())
          .map((location) => ({
            path: location.path,
            ...(location.line > 0 ? { line: location.line } : {}),
            ...(location.symbol ? { symbol: location.symbol } : {}),
            ...(location.description ? { description: location.description } : {}),
          })),
        evidence: finding.evidence,
        attackScenario: finding.attackScenario,
        remediation: finding.remediation,
        validationStatus: "not-planned",
        validationNotes: {
          suspectedVulnerability: finding.validationNotes.suspectedVulnerability || finding.title,
          exploitabilityReasoning: finding.validationNotes.exploitabilityReasoning,
          relevantPaths: finding.validationNotes.relevantPaths,
          preconditions: finding.validationNotes.preconditions,
          confirmationActions: finding.validationNotes.confirmationActions,
          successCriteria: finding.validationNotes.successCriteria,
          disproofCriteria: finding.validationNotes.disproofCriteria,
          usefulArtifacts: finding.validationNotes.usefulArtifacts,
        },
      } satisfies Finding;
    });
}

function normalizeSeverity(value: string): Finding["severity"] {
  const normalized = value.toLowerCase();
  if (["critical", "high", "medium", "low", "info"].includes(normalized))
    return normalized as Finding["severity"];
  return "medium";
}

function normalizeConfidence(value: string): Finding["confidence"] {
  const normalized = value.toLowerCase();
  if (["high", "medium", "low"].includes(normalized)) return normalized as Finding["confidence"];
  if (normalized === "confirmed") return "high";
  return "medium";
}
