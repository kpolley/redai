import { z } from "zod";
import {
  canUseClaudeAgentSdk,
  collectClaudeStructuredOutput,
} from "../agents/claude/claude-agent-session";
import { canUseCodexSdk, collectCodexStructuredOutput } from "../agents/codex/codex-agent-session";
import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { Artifact } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export type ScannerProvider = "claude" | "codex";

export interface ScannerCollectInput {
  runId: string;
  prompt: string;
  cwd: string;
  schema: z.ZodTypeAny;
  /**
   * Base name for the transcript file (no `transcripts/` prefix, no provider prefix, no extension).
   * Example: `"threat-model"` becomes `transcripts/threat-model.jsonl` (claude) or
   * `transcripts/codex-threat-model.jsonl` (codex).
   */
  transcriptName: string;
  /**
   * Human label for the transcript artifact title. The runner adds a `Codex ` prefix when relevant.
   * Example: `"Threat model agent transcript"`.
   */
  transcriptLabel: string;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface ScannerCollectResult {
  structuredOutput: unknown;
  transcriptArtifact?: Artifact;
}

export interface ScannerProseInput {
  runId: string;
  prompt: string;
  cwd: string;
  /** Base name for the transcript and prose artifacts (no extension, no path prefix). */
  transcriptName: string;
  /** Human label used in artifact titles. */
  transcriptLabel: string;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface ScannerProseResult {
  prose: string;
  transcriptArtifact?: Artifact;
  proseArtifact?: Artifact;
}

export interface ScannerAgentRunner {
  readonly id: ScannerProvider;
  /** Full SDK label used in error messages, e.g. "Claude Agent SDK". */
  readonly label: string;
  /** True when credentials/config are present for this provider. */
  available(): boolean;
  /** Schema-constrained call. Used when the output is genuinely structured (e.g. file prioritization). */
  collect(input: ScannerCollectInput): Promise<ScannerCollectResult>;
  /** Free-form analyst call. Returns prose; pair with a Structurer to extract a typed shape. */
  runProse(input: ScannerProseInput): Promise<ScannerProseResult>;
}

export const claudeScannerAgentRunner: ScannerAgentRunner = {
  id: "claude",
  label: "Claude Agent SDK",
  available: canUseClaudeAgentSdk,
  async collect(input) {
    const { structuredOutput, transcriptArtifact } = await collectClaudeStructuredOutput({
      runId: input.runId,
      prompt: input.prompt,
      options: {
        cwd: input.cwd,
        tools: ["Read", "Glob", "Grep"],
        allowedTools: ["Read", "Glob", "Grep"],
        disallowedTools: ["Write", "Edit", "MultiEdit", "Bash"],
        outputFormat: {
          type: "json_schema",
          schema: z.toJSONSchema(input.schema) as Record<string, unknown>,
        },
      },
      transcriptPath: `transcripts/${input.transcriptName}.jsonl`,
      transcriptTitle: input.transcriptLabel,
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });
    return transcriptArtifact ? { structuredOutput, transcriptArtifact } : { structuredOutput };
  },
  async runProse(input) {
    const { finalResponse, transcriptArtifact } = await collectClaudeStructuredOutput({
      runId: input.runId,
      prompt: input.prompt,
      options: {
        cwd: input.cwd,
        tools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
      },
      transcriptPath: `transcripts/${input.transcriptName}.jsonl`,
      transcriptTitle: input.transcriptLabel,
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });
    return finalizeProseResult({
      prose: finalResponse,
      input,
      ...(transcriptArtifact ? { transcriptArtifact } : {}),
    });
  },
};

export const codexScannerAgentRunner: ScannerAgentRunner = {
  id: "codex",
  label: "Codex SDK",
  available: canUseCodexSdk,
  async collect(input) {
    const { structuredOutput, transcriptArtifact } = await collectCodexStructuredOutput({
      runId: input.runId,
      prompt: input.prompt,
      cwd: input.cwd,
      outputSchema: z.toJSONSchema(input.schema) as Record<string, unknown>,
      transcriptPath: `transcripts/codex-${input.transcriptName}.jsonl`,
      transcriptTitle: `Codex ${lowercaseFirst(input.transcriptLabel)}`,
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });
    return transcriptArtifact ? { structuredOutput, transcriptArtifact } : { structuredOutput };
  },
  async runProse(input) {
    const { finalResponse, transcriptArtifact } = await collectCodexStructuredOutput({
      runId: input.runId,
      prompt: input.prompt,
      cwd: input.cwd,
      transcriptPath: `transcripts/codex-${input.transcriptName}.jsonl`,
      transcriptTitle: `Codex ${lowercaseFirst(input.transcriptLabel)}`,
      ...(input.artifactStore ? { artifactStore: input.artifactStore } : {}),
      ...(input.emit ? { emit: input.emit } : {}),
    });
    return finalizeProseResult({
      prose: finalResponse,
      input,
      ...(transcriptArtifact ? { transcriptArtifact } : {}),
    });
  },
};

async function finalizeProseResult(args: {
  prose: string;
  transcriptArtifact?: Artifact;
  input: ScannerProseInput;
}): Promise<ScannerProseResult> {
  const { prose, transcriptArtifact, input } = args;
  let proseArtifact: Artifact | undefined;
  if (input.artifactStore && prose.trim()) {
    proseArtifact = await input.artifactStore.writeText(
      input.runId,
      `analyses/${input.transcriptName}.md`,
      `${prose.trimEnd()}\n`,
      {
        kind: "note",
        title: input.transcriptLabel,
        contentType: "text/markdown",
        summary: `Analyst prose for ${input.transcriptName}.`,
      },
    );
    if (input.emit) {
      await input.emit({
        type: "artifact.created",
        runId: input.runId,
        jobId: `analyses/${input.transcriptName}.md`,
        artifact: proseArtifact,
      });
    }
  }
  const result: ScannerProseResult = { prose };
  if (transcriptArtifact) result.transcriptArtifact = transcriptArtifact;
  if (proseArtifact) result.proseArtifact = proseArtifact;
  return result;
}

export function getScannerAgentRunner(provider: ScannerProvider): ScannerAgentRunner {
  return provider === "codex" ? codexScannerAgentRunner : claudeScannerAgentRunner;
}

/**
 * Parses a runner's structured output, returning a discriminated result that lets callers either
 * surface the parsed data, fall back to a default summary (unit scanner), or throw a labelled
 * error (threat model / finding scanner / aggregator).
 */
export function parseScannerOutput<T extends z.ZodTypeAny>(
  schema: T,
  result: ScannerCollectResult,
):
  | { kind: "ok"; data: z.infer<T>; transcriptArtifact?: Artifact }
  | { kind: "missing"; transcriptArtifact?: Artifact }
  | { kind: "invalid"; error: z.ZodError; transcriptArtifact?: Artifact } {
  const transcriptPart = result.transcriptArtifact
    ? { transcriptArtifact: result.transcriptArtifact }
    : {};
  if (!result.structuredOutput) return { kind: "missing", ...transcriptPart };
  const parsed = schema.safeParse(result.structuredOutput);
  if (!parsed.success) return { kind: "invalid", error: parsed.error, ...transcriptPart };
  return { kind: "ok", data: parsed.data, ...transcriptPart };
}

export function formatScannerSchemaError(
  runner: ScannerAgentRunner,
  stage: string,
  error: z.ZodError,
): string {
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
  return `${runner.label} returned invalid structured ${stage} output: ${issues.join("; ")}`;
}

function lowercaseFirst(value: string): string {
  return value.length > 0 ? `${value[0]?.toLowerCase()}${value.slice(1)}` : value;
}
