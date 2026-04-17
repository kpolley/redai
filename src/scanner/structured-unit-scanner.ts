import { join } from "node:path";
import { getRedaiRunDir } from "../paths";
import { normalizeFindingAgentOutputs } from "./finding-agent-output";
import { buildUnitScannerAgentPrompt } from "./prompts/unit-scanner-agent-prompt";
import type { ScannerAgentRunner } from "./scanner-agent-runner";
import { getStructurer } from "./structurer";
import type { UnitScanner, UnitScannerInput, UnitScannerOutput } from "./unit-scanner";
import {
  normalizeUnitScannerResult,
  unitScannerAgentOutputSchema,
} from "./unit-scanner-agent-output";

export class StructuredUnitScanner implements UnitScanner {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async scanUnit(input: UnitScannerInput): Promise<UnitScannerOutput> {
    if (input.run.target.kind !== "source-directory") {
      throw new Error(`${this.runner.label} unit scanning requires a source-directory target.`);
    }

    const scratchDir = join(
      input.artifactStore?.runDir(input.run.id) ?? getRedaiRunDir(input.run.id),
      "scratch/unit-scan",
      safePathPart(input.unit.id),
    );

    const proseResult = await this.runner.runProse({
      runId: input.run.id,
      prompt: buildUnitScannerAgentPrompt({
        run: input.run,
        threatModel: input.threatModel,
        unit: input.unit,
        scratchDir,
        ...(input.sourceContext ? { sourceContext: input.sourceContext } : {}),
      }),
      cwd: input.run.target.path,
      transcriptName: `unit-${safePathPart(input.unit.id)}`,
      transcriptLabel: `Unit scanner transcript: ${input.unit.title}`,
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });

    const transcriptPath = proseResult.proseArtifact?.path ?? proseResult.transcriptArtifact?.path;

    if (!proseResult.prose.trim()) {
      return {
        result: normalizeUnitScannerResult(
          {
            summary: `${this.runner.label} reviewed the unit but returned no prose. See transcript for details.`,
            securityObservations: [],
            followUpUnitIds: [],
          },
          input.unit.id,
          [],
          transcriptPath,
        ),
        candidateFindings: [],
      };
    }

    const structurer = getStructurer(this.runner.id);
    let structured: ReturnType<typeof unitScannerAgentOutputSchema.parse>;
    try {
      structured = await structurer.structure({
        prose: proseResult.prose,
        schema: unitScannerAgentOutputSchema,
        instructions:
          'Extract a unit scan result and every candidate finding the analyst named in the prose. Any vulnerability, weakness, or suspicious behavior described in the prose — including anything under headings like "Candidate Findings", "Findings", "Vulnerabilities", or numbered `### Finding N` / `### N.` lists — MUST appear as its own entry in `candidateFindings` with at least a title. Populate affected locations, evidence, attack scenario, remediation, and validation notes from whatever the prose supplies. Leave `candidateFindings` empty ONLY when the prose explicitly says the unit is clean.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        result: normalizeUnitScannerResult(
          {
            summary: `${this.runner.label} review prose could not be structured. See transcript for details.`,
            securityObservations: [message],
            followUpUnitIds: [],
          },
          input.unit.id,
          [],
          transcriptPath,
        ),
        candidateFindings: [],
      };
    }

    const candidateFindings = normalizeFindingAgentOutputs(structured.candidateFindings);
    return {
      result: normalizeUnitScannerResult(
        structured.result,
        input.unit.id,
        candidateFindings,
        transcriptPath,
      ),
      candidateFindings,
    };
  }
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160);
}
