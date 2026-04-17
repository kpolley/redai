import type { ScanRun } from "../../domain";

export interface FindingAggregatorPromptInput {
  run: ScanRun;
  candidateCount: number;
  unitCount: number;
  candidateFindingsPath: string;
  threatModelPath: string;
  unitResultsPath: string;
  scratchDir: string;
}

export function buildFindingAggregatorAgentPrompt(input: FindingAggregatorPromptInput): string {
  return `You are RedAI's finding aggregator.

Goal: take the ${input.candidateCount} candidate ${input.candidateCount === 1 ? "finding" : "findings"} produced by ${input.unitCount} micro-scanner ${input.unitCount === 1 ? "run" : "runs"} and produce the final list of findings worth handing to validators. Merge duplicates, combine evidence from related units, and drop the candidates that didn't earn their spot. Keep what's grounded in real code; cut what's speculative.

Inputs on disk (relative to the source directory):
- Candidate findings: ${input.candidateFindingsPath}
- Threat model: ${input.threatModelPath}
- Unit results: ${input.unitResultsPath}

Read those files as you need them. You don't have to hold everything in your head at once — pull in what you're working on, cross-reference source files to resolve ambiguity, and move on.

Boundaries:
- Treat the source directory as read-only. Do not modify, delete, or move source files.
- You may write scratch files and run scripts under ${input.scratchDir} — use it freely to diff candidates, group them, prototype checks, or take notes.
- No live-system exploitation — this is analysis, not active testing.

Source directory: ${input.run.target.kind === "source-directory" ? input.run.target.path : "unknown"}

Write your response as prose. For each final finding describe what it is, where it lives in the code, the combined evidence, the attack scenario, what would confirm or disprove it, and the fix. If everything washes out, say so. A separate structuring step will turn your write-up into the typed shape — you do not need to think about JSON.
`;
}
