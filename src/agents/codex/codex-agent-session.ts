import { Codex, type ThreadEvent, type ThreadItem } from "@openai/codex-sdk";
import type { RunArtifactStore } from "../../artifacts/run-artifact-store";
import { loadLocalEnv } from "../../config/load-local-env";
import type { Artifact } from "../../domain";
import type { RunEventEmitter } from "../../pipeline/events";

export interface CollectCodexStructuredOutputInput {
  runId: string;
  prompt: string;
  cwd: string;
  outputSchema?: Record<string, unknown>;
  transcriptPath: string;
  transcriptTitle: string;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
  jobId?: string;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  additionalDirectories?: string[];
}

export interface CollectCodexStructuredOutputResult {
  structuredOutput: unknown;
  transcriptArtifact?: Artifact;
  finalResponse: string;
}

export async function collectCodexStructuredOutput(
  input: CollectCodexStructuredOutputInput,
): Promise<CollectCodexStructuredOutputResult> {
  const codex = new Codex(
    input.env ? { env: { ...process.env, ...input.env } as Record<string, string> } : undefined,
  );
  const thread = codex.startThread({
    workingDirectory: input.cwd,
    skipGitRepoCheck: true,
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    ...(input.additionalDirectories ? { additionalDirectories: input.additionalDirectories } : {}),
  });
  const events: ThreadEvent[] = [];
  const items: ThreadEvent[] = [];
  let finalResponse = "";
  let usage: unknown = null;
  const turn = await thread.runStreamed(input.prompt, {
    ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  for await (const event of turn.events) {
    events.push(event);
    if (event.type === "item.completed") {
      items.push(event);
      await emitCodexTrace(input, event.item);
      if (event.item.type === "agent_message") finalResponse = event.item.text;
    } else if (event.type === "turn.completed") {
      usage = event.usage;
    } else if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  const structuredOutput = extractJsonObject(finalResponse);
  const transcriptContent = `${[
    ...events.map((event) => JSON.stringify(event)),
    JSON.stringify({ type: "turn.result", finalResponse, usage, items }),
  ].join("\n")}\n`;
  const transcriptArtifact = input.artifactStore
    ? await input.artifactStore.writeText(input.runId, input.transcriptPath, transcriptContent, {
        kind: "agent-transcript",
        title: input.transcriptTitle,
        contentType: "application/x-ndjson",
        summary: `Captured Codex SDK turn with ${items.length} completed items.`,
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

async function emitCodexTrace(
  input: CollectCodexStructuredOutputInput,
  item: ThreadItem,
): Promise<void> {
  if (!input.emit || !input.jobId) return;
  const message = codexTraceMessage(item);
  if (!message) return;
  await input.emit({
    type: "validation.agent.output",
    runId: input.runId,
    jobId: input.jobId,
    message,
  });
}

function codexTraceMessage(item: ThreadItem): string | undefined {
  if (item.type === "agent_message") return `Agent: ${compact(item.text)}`;
  if (item.type === "command_execution")
    return `Command: ${compact(item.command)}${item.exit_code === undefined ? "" : ` → ${item.exit_code}`}`;
  if (item.type === "mcp_tool_call") return `Tool: ${item.server}.${item.tool} ${item.status}`;
  if (item.type === "error") return `Error: ${item.message}`;
  return undefined;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function canUseCodexSdk(): boolean {
  if (!process.env.OPENAI_API_KEY && !process.env.CODEX_API_KEY) loadLocalEnv();
  return Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    fenced?.[1],
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
    text,
  ].filter((value): value is string => Boolean(value?.trim()));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}
