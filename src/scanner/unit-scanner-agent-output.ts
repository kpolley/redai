import { z } from "zod";
import type { AnalysisUnitResult, Finding } from "../domain";
import { findingAgentOutputSchema } from "./finding-agent-output";
import { tolerantString, tolerantStringArray } from "./zod-helpers";

const unitScannerResultAgentOutputSchema = z.object({
  summary: tolerantString.default(""),
  securityObservations: tolerantStringArray(),
  followUpUnitIds: tolerantStringArray(),
});

export const unitScannerAgentOutputSchema = z.object({
  result: unitScannerResultAgentOutputSchema.default({
    summary: "",
    securityObservations: [],
    followUpUnitIds: [],
  }),
  candidateFindings: z.array(findingAgentOutputSchema).default([]),
});
export type UnitScannerAgentOutput = z.infer<typeof unitScannerAgentOutputSchema>;

export function normalizeUnitScannerResult(
  output: UnitScannerAgentOutput["result"],
  unitId: string,
  candidateFindings: Finding[],
  transcriptRef?: string,
): AnalysisUnitResult {
  return {
    unitId,
    status: "completed",
    summary: output.summary,
    securityObservations: output.securityObservations,
    candidateFindingIds: candidateFindings.map((finding) => finding.id),
    followUpUnitIds: output.followUpUnitIds,
    ...(transcriptRef ? { transcriptRef } : {}),
  };
}
