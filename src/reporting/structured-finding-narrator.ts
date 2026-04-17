import { join } from "node:path";
import type { ScannerAgentRunner } from "../scanner/scanner-agent-runner";
import { getStructurer } from "../scanner/structurer";
import type { FindingNarrative, FindingNarrator, FindingNarratorInput } from "./finding-narrator";
import { findingNarrativeAgentOutputSchema } from "./finding-narrator-agent-output";
import { buildFindingNarratorAgentPrompt } from "./prompts/finding-narrator-agent-prompt";

export class StructuredFindingNarrator implements FindingNarrator {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async narrate(input: FindingNarratorInput): Promise<FindingNarrative> {
    const { run, finding, validationResult, artifactStore } = input;
    if (run.target.kind !== "source-directory") {
      throw new Error(`${this.runner.label} report narration requires a source-directory target.`);
    }

    const transcriptName = `report-narrator-${shortId(finding.id)}`;
    const transcriptLabel = `Report narrator transcript: ${finding.id}`;
    const scratchDir = join(artifactStore.runDir(run.id), "scratch/report-narration", finding.id);

    const evidence = validationResult?.evidence ?? [];
    const artifactAbsolutePaths = evidence
      .filter((artifact) => artifact.kind !== "agent-transcript" && artifact.path)
      .map((artifact) => ({
        artifactPath: artifact.path as string,
        absolutePath: artifactStore.resolveArtifact(run.id, artifact.path as string),
      }));

    const proseResult = await this.runner.runProse({
      runId: run.id,
      prompt: buildFindingNarratorAgentPrompt({
        finding,
        validationResult,
        artifactAbsolutePaths,
        scratchDir,
      }),
      cwd: run.target.path,
      transcriptName,
      transcriptLabel,
      artifactStore,
      ...(input.emit ? { emit: input.emit } : {}),
    });

    if (!proseResult.prose.trim()) {
      return emptyNarrative(finding.id);
    }

    const structurer = getStructurer(this.runner.id);
    let structured: ReturnType<typeof findingNarrativeAgentOutputSchema.parse>;
    try {
      structured = await structurer.structure({
        prose: proseResult.prose,
        schema: findingNarrativeAgentOutputSchema,
        instructions:
          'Extract the rewritten Description, Exploit Scenario, and Recommendations prose for a single security finding verbatim from the analyst\'s output. Every artifact the analyst picked as an inline embed — including picks written under headings like "Inline Embeds", "Figures", or `- path: ... caption: ...` bullets — MUST appear as its own entry in `inlineEmbeds` with the exact `artifactPath` string the analyst used. Only leave `inlineEmbeds` empty when the prose picks none.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.emit) {
        await input.emit({
          type: "run.activity",
          runId: run.id,
          activity: {
            id: crypto.randomUUID(),
            level: "warn",
            message: `Report narrator structurer failed for ${finding.id}: ${message}`,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return emptyNarrative(finding.id);
    }

    // Drop embeds that don't match a real artifact path — guards against the
    // narrator inventing references the renderer can't link to.
    const validPaths = new Set(artifactAbsolutePaths.map(({ artifactPath }) => artifactPath));
    const inlineEmbeds = structured.inlineEmbeds.filter(
      (embed) => embed.artifactPath && validPaths.has(embed.artifactPath),
    );

    return {
      findingId: finding.id,
      description: structured.description.trim(),
      exploitScenario: structured.exploitScenario.trim(),
      recommendations: structured.recommendations.trim(),
      inlineEmbeds,
    };
  }
}

function emptyNarrative(findingId: string): FindingNarrative {
  return {
    findingId,
    description: "",
    exploitScenario: "",
    recommendations: "",
    inlineEmbeds: [],
  };
}

function shortId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "finding";
}
