import { join } from "node:path";
import type { Finding } from "../domain";
import { pluralize } from "../utils/pluralize";
import { findingListAgentOutputSchema, normalizeFindingAgentOutputs } from "./finding-agent-output";
import type { FindingAggregator, FindingAggregatorInput } from "./finding-aggregator";
import { buildFindingAggregatorAgentPrompt } from "./prompts/finding-aggregator-agent-prompt";
import type { ScannerAgentRunner } from "./scanner-agent-runner";
import { getStructurer } from "./structurer";

export class StructuredFindingAggregator implements FindingAggregator {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async aggregateFindings(input: FindingAggregatorInput): Promise<Finding[]> {
    if (input.run.target.kind !== "source-directory") {
      throw new Error(
        `${this.runner.label} finding aggregation requires a source-directory target.`,
      );
    }

    if (input.candidateFindings.length === 0) return [];
    if (!input.artifactStore) {
      throw new Error(
        `${this.runner.label} finding aggregation requires an artifact store to persist candidate findings to disk.`,
      );
    }

    const candidateFindingsArtifact = await input.artifactStore.writeText(
      input.run.id,
      "aggregation/candidate-findings.json",
      `${JSON.stringify(input.candidateFindings, null, 2)}\n`,
      {
        kind: "file",
        title: "Aggregator input: candidate findings",
        contentType: "application/json",
        summary: `${pluralize(input.candidateFindings.length, "candidate finding")} from unit scans.`,
      },
    );
    const threatModelArtifact = await input.artifactStore.writeText(
      input.run.id,
      "aggregation/threat-model.json",
      `${JSON.stringify(input.threatModel, null, 2)}\n`,
      {
        kind: "file",
        title: "Aggregator input: threat model",
        contentType: "application/json",
        summary: "Threat model context for the aggregator.",
      },
    );
    const unitResultsArtifact = await input.artifactStore.writeText(
      input.run.id,
      "aggregation/unit-results.json",
      `${JSON.stringify(input.unitResults, null, 2)}\n`,
      {
        kind: "file",
        title: "Aggregator input: unit results",
        contentType: "application/json",
        summary: `${pluralize(input.unitResults.length, "unit result")}.`,
      },
    );

    if (input.emit) {
      for (const artifact of [
        candidateFindingsArtifact,
        threatModelArtifact,
        unitResultsArtifact,
      ]) {
        await input.emit({
          type: "artifact.created",
          runId: input.run.id,
          jobId: artifact.path ?? artifact.id,
          artifact,
        });
      }
    }

    const scratchDir = join(input.artifactStore.runDir(input.run.id), "scratch/aggregation");

    const proseResult = await this.runner.runProse({
      runId: input.run.id,
      prompt: buildFindingAggregatorAgentPrompt({
        run: input.run,
        candidateCount: input.candidateFindings.length,
        unitCount: input.analysisUnits.length,
        candidateFindingsPath: input.artifactStore.resolveArtifact(
          input.run.id,
          candidateFindingsArtifact.path ?? "",
        ),
        threatModelPath: input.artifactStore.resolveArtifact(
          input.run.id,
          threatModelArtifact.path ?? "",
        ),
        unitResultsPath: input.artifactStore.resolveArtifact(
          input.run.id,
          unitResultsArtifact.path ?? "",
        ),
        scratchDir,
      }),
      cwd: input.run.target.path,
      transcriptName: "finding-aggregator",
      transcriptLabel: "Finding aggregator agent transcript",
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
          'Extract every distinct finding the analyst\'s prose keeps into the `findings` array — including anything written under headings like "Final Findings", "Confirmed Findings", "Vulnerabilities", or numbered `### N. Title` lists. The analyst has already deduplicated and filtered; your job is transcription, not further pruning. Each surviving finding in the prose must appear as its own entry with at least a title; populate affected locations, evidence, attack scenario, remediation, and validation notes from whatever detail the prose supplies. Only omit a candidate if the prose explicitly says it was dropped or merged into another.',
      });
      return normalizeFindingAgentOutputs(structured.findings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.emit) {
        await input.emit({
          type: "run.activity",
          runId: input.run.id,
          activity: {
            id: crypto.randomUUID(),
            level: "warn",
            message: `Finding aggregator structurer failed, falling back to unaggregated candidates: ${message}`,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return input.candidateFindings;
    }
  }
}
