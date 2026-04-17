import type { AnalysisUnit, ScanRun, ThreatModel } from "../../domain";
import type { UnitSourceContext } from "../unit-source-context";

export interface UnitScannerPromptInput {
  run: ScanRun;
  threatModel: ThreatModel;
  unit: AnalysisUnit;
  scratchDir: string;
  sourceContext?: UnitSourceContext;
}

export function buildUnitScannerAgentPrompt(input: UnitScannerPromptInput): string {
  const { run, threatModel, unit, sourceContext, scratchDir } = input;
  return `You are RedAI's micro vulnerability scanner.

Goal: review one analysis unit and write up what you see. If something looks like a real candidate finding, describe it in enough detail that a validator could try to prove or disprove it. If nothing stands out, say so honestly — empty hands are fine.

Boundaries:
- Treat the source directory as read-only. Do not modify, delete, or move source files.
- You may write scratch files and run scripts under ${scratchDir} — use it freely to test hypotheses, prototype checks, or take notes.
- Code analysis only — do not attempt live-system exploitation or claim something is confirmed exploitable.

Source directory: ${run.target.kind === "source-directory" ? run.target.path : "unknown"}

Analysis unit:
${JSON.stringify(unit, null, 2)}

Primary source context:
${sourceContext ? formatSourceContext(sourceContext) : "No source excerpt was attached. Read the referenced files yourself."}

Threat model context:
${JSON.stringify(
  {
    summary: threatModel.summary,
    assets: threatModel.assets,
    trustBoundaries: threatModel.trustBoundaries,
    relevantThreats: threatModel.threats.filter((threat) =>
      unit.relatedThreats.includes(threat.id),
    ),
    recommendedFocusAreas: threatModel.recommendedFocusAreas,
  },
  null,
  2,
)}

Write your response as prose: a short summary of what you reviewed, your security observations, and any candidate findings (with affected locations, evidence, attack scenario, validation notes, and remediation). A separate structuring step will turn your write-up into the typed shape — you do not need to think about JSON.
`;
}

function formatSourceContext(context: UnitSourceContext): string {
  return `File: ${context.primaryFile}\nLines: ${context.startLine}-${context.endLine}${context.truncated ? " (excerpt truncated)" : ""}\n\n\`\`\`\n${context.excerpt}\n\`\`\``;
}
