import { join } from "node:path";
import type { ThreatModel } from "../domain";
import { getRedaiRunDir } from "../paths";
import { buildThreatModelAgentPrompt } from "./prompts/threat-model-agent-prompt";
import type { ScannerAgentRunner } from "./scanner-agent-runner";
import { getStructurer } from "./structurer";
import {
  normalizeThreatModelAgentOutput,
  threatModelAgentOutputSchema,
} from "./threat-model-agent-output";
import type { ThreatModeler, ThreatModelerInput } from "./threat-modeler";

export class StructuredThreatModeler implements ThreatModeler {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async buildThreatModel(input: ThreatModelerInput): Promise<ThreatModel> {
    const { run } = input;
    if (run.target.kind !== "source-directory") {
      throw new Error(`${this.runner.label} threat modeling requires a source-directory target.`);
    }

    const scratchDir = join(
      input.artifactStore?.runDir(run.id) ?? getRedaiRunDir(run.id),
      "scratch/threat-model",
    );

    const proseResult = await this.runner.runProse({
      runId: run.id,
      prompt: buildThreatModelAgentPrompt({ run, scratchDir }),
      cwd: run.target.path,
      transcriptName: "threat-model",
      transcriptLabel: "Threat model agent transcript",
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });

    if (!proseResult.prose.trim()) {
      throw new Error(`${this.runner.label} returned no threat model prose.`);
    }

    const structurer = getStructurer(this.runner.id);
    const transcriptRef = proseResult.proseArtifact?.path ?? proseResult.transcriptArtifact?.path;
    try {
      const structured = await structurer.structure({
        prose: proseResult.prose,
        schema: threatModelAgentOutputSchema,
        instructions:
          'Extract a threat model from the analyst\'s prose. Every distinct asset, trust boundary, entrypoint, data flow, assumption, and threat named or described in the prose MUST appear as its own entry in the corresponding array — including threats written under headings like "Threats", "Vulnerabilities", "Risks", or numbered `### N. Title` lists. Give each threat at least a title; use the surrounding paragraphs to fill severity, likelihood, rationale, affected assets, and validation ideas when the prose states them. Do not merge multiple prose threats into one entry and do not omit any.',
      });
      return normalizeThreatModelAgentOutput(run, structured, transcriptRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.emit) {
        await input.emit({
          type: "run.activity",
          runId: run.id,
          activity: {
            id: crypto.randomUUID(),
            level: "warn",
            message: `Threat model structurer failed, continuing with empty model: ${message}`,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return normalizeThreatModelAgentOutput(
        run,
        threatModelAgentOutputSchema.parse({}),
        transcriptRef,
      );
    }
  }
}
