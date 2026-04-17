import Anthropic from "@anthropic-ai/sdk";
import { loadLocalEnv } from "../../config/load-local-env";

export interface CollectAnthropicStructuredOutputInput {
  instructions: string;
  input: string;
  outputSchema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function collectAnthropicStructuredOutput(
  input: CollectAnthropicStructuredOutputInput,
): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) loadLocalEnv();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create(
    {
      model: input.model ?? "claude-opus-4-6",
      max_tokens: input.maxTokens ?? 16384,
      system: input.instructions,
      messages: [{ role: "user", content: input.input }],
      tools: [
        {
          name: input.toolName,
          description: input.toolDescription,
          input_schema: input.outputSchema as { type: "object" },
        },
      ],
      tool_choice: { type: "tool", name: input.toolName },
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  const toolUse = message.content.find(
    (block) => block.type === "tool_use" && block.name === input.toolName,
  );
  return toolUse?.type === "tool_use" ? toolUse.input : undefined;
}

export function canUseAnthropicApi(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) loadLocalEnv();
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
