import type { ScanRun, ThreatModel } from "../../domain";

export interface FilePrioritizerPromptInput {
  run: ScanRun;
  threatModel: ThreatModel;
  candidatePathsFile: string;
  candidateCount: number;
  scratchDir: string;
}

export function buildFilePrioritizerAgentPrompt(input: FilePrioritizerPromptInput): string {
  const focusAreas = input.threatModel.recommendedFocusAreas.map((area) => ({
    title: area.title,
    rationale: area.rationale,
  }));
  const threats = input.threatModel.threats.map((threat) => ({
    title: threat.title,
    category: threat.category,
    severity: threat.severity,
    rationale: threat.rationale,
  }));
  const entrypoints = input.threatModel.entrypoints.map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    location: entry.location ?? "",
    description: entry.description,
  }));

  return `You are RedAI's file prioritization analyst.

Goal: rank source files by how likely they are to contain security-relevant code given the threat model below. A downstream stage uses your scores to pick which files get scanned in depth.

The source walker found ${input.candidateCount} candidate ${input.candidateCount === 1 ? "file" : "files"}. The list is on disk (relative to the source directory):
- ${input.candidatePathsFile}

Read it however you like — in chunks, via grep, however. Navigate the source tree yourself to disambiguate paths, sample file contents, or discover files the walker missed. If you find a security-relevant file outside the candidate list, you may include it in your ranking.

Score each file you choose to rank on a 0..1 scale where 1 means "definitely scan" and 0 means "almost certainly nothing security-relevant here". Be calibrated — most files shouldn't be 1.0. Files clearly out of scope (fixtures, generated code, vendored assets, pure UI, etc.) belong in "excluded" so they're skipped entirely.

Use bare relative file paths exactly as they appear in the candidate list. Do not append line or column numbers to ranked or excluded paths.

Boundaries:
- Treat the source directory as read-only. Do not modify, delete, or move source files.
- You may write scratch files and run scripts under ${input.scratchDir} — use it freely for notes, groupings, or quick probes.

Source directory: ${input.run.target.kind === "source-directory" ? input.run.target.path : "unknown"}

Threat model focus areas:
${JSON.stringify(focusAreas, null, 2)}

Threats:
${JSON.stringify(threats, null, 2)}

Entrypoints:
${JSON.stringify(entrypoints, null, 2)}

Write your response as prose — a readable ranking document with your scores, rationales, and any exclusions. A separate structuring step will turn your write-up into the typed shape, so you do not need to think about JSON or enum values.
`;
}
