import { type Options, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RunArtifactStore } from "../../artifacts/run-artifact-store";
import { loadLocalEnv } from "../../config/load-local-env";
import type { Artifact } from "../../domain";
import type { RunEventEmitter } from "../../pipeline/events";

export function canUseClaudeAgentSdk(): boolean {
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.CLAUDE_CODE_USE_BEDROCK &&
    !process.env.CLAUDE_CODE_USE_VERTEX
  )
    loadLocalEnv();
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_CODE_USE_BEDROCK ||
      process.env.CLAUDE_CODE_USE_VERTEX,
  );
}

export interface CollectClaudeStructuredOutputInput {
  runId: string;
  prompt: string;
  options: Options;
  transcriptPath: string;
  transcriptTitle: string;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
  jobId?: string;
}

export interface CollectClaudeStructuredOutputResult {
  structuredOutput: unknown;
  transcriptArtifact?: Artifact;
  finalResponse: string;
}

export async function collectClaudeStructuredOutput(
  input: CollectClaudeStructuredOutputInput,
): Promise<CollectClaudeStructuredOutputResult> {
  const messages: SDKMessage[] = [];
  let structuredOutput: unknown;
  let finalResponse = "";

  const response = query({ prompt: input.prompt, options: input.options });
  for await (const message of response) {
    messages.push(message);
    await emitClaudeTrace(input, message);
    if (message.type === "result" && message.subtype === "success") {
      finalResponse = message.result;
      structuredOutput = message.structured_output ?? extractJsonObject(message.result);
    }
  }

  const transcriptContent = `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
  const transcriptArtifact = input.artifactStore
    ? await input.artifactStore.writeText(input.runId, input.transcriptPath, transcriptContent, {
        kind: "agent-transcript",
        title: input.transcriptTitle,
        contentType: "application/x-ndjson",
        summary: `Captured ${messages.length} Claude Agent SDK messages.`,
      })
    : undefined;

  if (transcriptArtifact && input.emit) {
    await input.emit({
      type: "artifact.created",
      runId: input.runId,
      jobId: input.transcriptPath,
      artifact: transcriptArtifact,
    });
  }

  return transcriptArtifact
    ? { structuredOutput, transcriptArtifact, finalResponse }
    : { structuredOutput, finalResponse };
}

async function emitClaudeTrace(
  input: CollectClaudeStructuredOutputInput,
  message: SDKMessage,
): Promise<void> {
  if (!input.emit || !input.jobId) return;
  const trace = claudeTraceMessage(message);
  if (!trace) return;
  await input.emit({
    type: "validation.agent.output",
    runId: input.runId,
    jobId: input.jobId,
    message: trace,
  });
}

function claudeTraceMessage(message: SDKMessage): string | undefined {
  if (message.type === "assistant")
    return `Agent: ${compact(JSON.stringify(message.message.content))}`;
  if (message.type === "user")
    return `Tool result: ${compact(JSON.stringify(message.message.content))}`;
  if (message.type === "result") return `Agent completed: ${message.subtype}`;
  return undefined;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}
