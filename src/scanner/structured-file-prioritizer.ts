import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { FilePrioritization } from "../domain";
import { pluralize } from "../utils/pluralize";
import type { FilePrioritizer, FilePrioritizerInput } from "./file-prioritizer";
import {
  filePrioritizationAgentOutputSchema,
  normalizeFilePrioritizationOutput,
} from "./file-prioritizer-agent-output";
import { buildFilePrioritizerAgentPrompt } from "./prompts/file-prioritizer-agent-prompt";
import type { ScannerAgentRunner } from "./scanner-agent-runner";
import { getStructurer } from "./structurer";

export class StructuredFilePrioritizer implements FilePrioritizer {
  constructor(private readonly runner: ScannerAgentRunner) {}

  async prioritize(input: FilePrioritizerInput): Promise<FilePrioritization> {
    if (input.run.target.kind !== "source-directory") {
      throw new Error(
        `${this.runner.label} file prioritization requires a source-directory target.`,
      );
    }

    if (input.candidatePaths.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        totalFiles: 0,
        prioritized: [],
        excluded: [],
        notes: "No candidate files were discovered.",
      };
    }

    if (!input.artifactStore) {
      throw new Error(
        `${this.runner.label} file prioritization requires an artifact store to persist the candidate paths to disk.`,
      );
    }

    const candidatePathsArtifact = await input.artifactStore.writeText(
      input.run.id,
      "prioritization/candidate-paths.txt",
      `${input.candidatePaths.join("\n")}\n`,
      {
        kind: "file",
        title: "File prioritizer input: candidate paths",
        contentType: "text/plain",
        summary: `${pluralize(input.candidatePaths.length, "candidate file path")} discovered by the source walker.`,
      },
    );

    if (input.emit) {
      await input.emit({
        type: "artifact.created",
        runId: input.run.id,
        jobId: candidatePathsArtifact.path ?? candidatePathsArtifact.id,
        artifact: candidatePathsArtifact,
      });
    }

    const scratchDir = join(input.artifactStore.runDir(input.run.id), "scratch/prioritization");
    const candidatePathsFile = input.artifactStore.resolveArtifact(
      input.run.id,
      candidatePathsArtifact.path ?? "",
    );

    const proseResult = await this.runner.runProse({
      runId: input.run.id,
      prompt: buildFilePrioritizerAgentPrompt({
        run: input.run,
        threatModel: input.threatModel,
        candidatePathsFile,
        candidateCount: input.candidatePaths.length,
        scratchDir,
      }),
      cwd: input.run.target.path,
      transcriptName: "file-prioritizer",
      transcriptLabel: "File prioritizer agent transcript",
      artifactStore: input.artifactStore,
      ...(input.emit ? { emit: input.emit } : {}),
    });

    if (!proseResult.prose.trim()) {
      return {
        generatedAt: new Date().toISOString(),
        totalFiles: input.candidatePaths.length,
        prioritized: [],
        excluded: [],
        notes: `${this.runner.label} returned no prioritization prose.`,
        ...(proseResult.proseArtifact?.path
          ? { transcriptRef: proseResult.proseArtifact.path }
          : {}),
      };
    }

    const structurer = getStructurer(this.runner.id);
    let structured: ReturnType<typeof filePrioritizationAgentOutputSchema.parse>;
    try {
      structured = await structurer.structure({
        prose: proseResult.prose,
        schema: filePrioritizationAgentOutputSchema,
        instructions:
          'Extract every file the analyst named in the prose. Any path explicitly ranked, prioritized, or excluded — including anything under headings like "Prioritized", "Excluded", "Candidates", or numbered / bulleted lists — MUST appear as its own entry. Each entry has a path, a score between 0 and 1, a short rationale, and optionally a category; fill whatever the prose supplies. Do not drop paths the prose mentions.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.emit) {
        await input.emit({
          type: "run.activity",
          runId: input.run.id,
          activity: {
            id: crypto.randomUUID(),
            level: "warn",
            message: `File prioritizer structurer failed, continuing with no ranking: ${message}`,
            createdAt: new Date().toISOString(),
          },
        });
      }
      return {
        generatedAt: new Date().toISOString(),
        totalFiles: input.candidatePaths.length,
        prioritized: [],
        excluded: [],
        notes: `${this.runner.label} prose could not be structured: ${message}`,
        ...(proseResult.proseArtifact?.path
          ? { transcriptRef: proseResult.proseArtifact.path }
          : {}),
      };
    }

    const knownPaths = await expandKnownPaths({
      sourceDir: input.run.target.path,
      walkerPaths: input.candidatePaths,
      agentPaths: [...structured.prioritized.map((entry) => entry.path), ...structured.excluded],
    });

    const transcriptRef = proseResult.proseArtifact?.path ?? proseResult.transcriptArtifact?.path;

    return normalizeFilePrioritizationOutput({
      output: structured,
      knownPaths,
      totalFiles: input.candidatePaths.length,
      ...(transcriptRef ? { transcriptRef } : {}),
    });
  }
}

async function expandKnownPaths(args: {
  sourceDir: string;
  walkerPaths: string[];
  agentPaths: string[];
}): Promise<Set<string>> {
  const known = new Set(args.walkerPaths);
  const discovered = args.agentPaths
    .map((path) => path.trim())
    .filter((path) => path && !known.has(path));
  const unique = Array.from(new Set(discovered));
  const checks = await Promise.all(
    unique.map(async (path) => {
      try {
        const info = await stat(join(args.sourceDir, path));
        return info.isFile() ? path : null;
      } catch {
        return null;
      }
    }),
  );
  for (const path of checks) {
    if (path) known.add(path);
  }
  return known;
}
