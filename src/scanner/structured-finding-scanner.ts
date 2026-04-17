import { join } from "node:path";
import type { Finding } from "../domain";
import { findingListAgentOutputSchema, normalizeFindingAgentOutputs } from "./finding-agent-output";
import type { FindingScanner, FindingScannerInput } from "./finding-scanner";
import { buildFindingScannerAgentPrompt } from "./prompts/finding-scanner-agent-prompt";
import type { ScannerAgentRunner } from "./scanner-agent-runner";
import { getStructurer } from "./structurer";

export class StructuredFindingScanner implements FindingScanner {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async findVulnerabilities(input: FindingScannerInput): Promise<Finding[]> {
    const { run, threatModel } = input;
    if (run.target.kind !== "source-directory") {
      throw new Error(`${this.runner.label} finding scanning requires a source-directory target.`);
    }
    if (!input.artifactStore) {
      throw new Error(
        `${this.runner.label} finding scanning requires an artifact store to persist the threat model to disk.`,
      );
    }

    const threatModelArtifact = await input.artifactStore.writeText(
      run.id,
      "finding-scan/threat-model.json",
      `${JSON.stringify(threatModel, null, 2)}\n`,
      {
        kind: "file",
        title: "Finding scanner input: threat model",
        contentType: "application/json",
        summary: "Threat model context for the finding scanner.",
      },
    );

    if (input.emit) {
      await input.emit({
        type: "artifact.created",
        runId: run.id,
        jobId: threatModelArtifact.path ?? threatModelArtifact.id,
        artifact: threatModelArtifact,
      });
    }

    const scratchDir = join(input.artifactStore.runDir(run.id), "scratch/finding-scan");
    const threatModelPath = input.artifactStore.resolveArtifact(
      run.id,
      threatModelArtifact.path ?? "",
    );

    const proseResult = await this.runner.runProse({
      runId: run.id,
      prompt: buildFindingScannerAgentPrompt({
        run,
        threatModelPath,
        scratchDir,
      }),
      cwd: run.target.path,
      transcriptName: "finding-scanner",
      transcriptLabel: "Finding scanner agent transcript",
      artifactStore: input.artifactStore,
      ...(input.emit ? { emit: input.emit } : {}),
    });

    if (!proseResult.prose.trim()) return [];

    const structurer = getStructurer(this.runner.id);
    try {
      const structured = await structurer.structure({
        prose: proseResult.prose,
        schema: findingListAgentOutputSchema,
        instructions:
          'Extract every candidate security finding the analyst named or described in the prose into the `findings` array — including anything written under headings like "Findings", "Vulnerabilities", "Issues", or numbered `### N. Title` lists. Each finding needs at least a title; populate affected locations, evidence, attack scenario, remediation, and validation notes from whatever detail the prose supplies. Do not merge multiple prose findings into one entry and do not omit any.',
      });
      return normalizeFindingAgentOutputs(structured.findings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.emit) {
        await input.emit({
          type: "run.activity",
          runId: run.id,
          activity: {
            id: crypto.randomUUID(),
            level: "warn",
            message: `Finding scanner structurer failed, continuing with no findings: ${message}`,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return [];
    }
  }
}
