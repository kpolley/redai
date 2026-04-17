import type { ScanRun } from "../../domain";
import { buildProjectBriefing } from "./project-briefing-prompt-context";

export interface ThreatModelPromptInput {
  run: ScanRun;
  scratchDir: string;
}

export function buildThreatModelAgentPrompt(input: ThreatModelPromptInput): string {
  const { run, scratchDir } = input;
  return `You are RedAI's threat-modeling agent.

Goal: produce a threat model for the target source directory that a downstream scanner and validator can act on. Decide for yourself what matters here — the project will tell you more than any checklist could.

Boundaries:
- Treat the source directory as read-only. Do not modify, delete, or move source files.
- You may write scratch files and run scripts under ${scratchDir} — use it freely for notes, diagrams, or quick probes.
- Threat modeling only — do not produce concrete findings or attempt validation.

Source directory: ${run.target.kind === "source-directory" ? run.target.path : "unknown"}

Project briefing:
${buildProjectBriefing(run)}

Explore the repo however you think makes sense. Trust your judgement on which threats are worth surfacing and how deep to go on each.

Write your response as prose — a readable threat model document. A separate structuring step will turn your write-up into the typed shape, so you do not need to think about JSON, field names, or enum values.
`;
}
