import OpenAI from "openai";
import { loadLocalEnv } from "../../config/load-local-env";

export interface CollectOpenAiStructuredOutputInput {
  instructions: string;
  input: string;
  outputSchema: Record<string, unknown>;
  schemaName: string;
  model?: string;
  signal?: AbortSignal;
}

export async function collectOpenAiStructuredOutput(
  input: CollectOpenAiStructuredOutputInput,
): Promise<unknown> {
  if (!process.env.OPENAI_API_KEY) loadLocalEnv();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create(
    {
      model: input.model ?? "gpt-5.2",
      instructions: input.instructions,
      input: input.input,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          schema: input.outputSchema,
          strict: true,
        },
      },
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  return parseJsonObject(response.output_text);
}

export function canUseOpenAiApi(): boolean {
  if (!process.env.OPENAI_API_KEY) loadLocalEnv();
  return Boolean(process.env.OPENAI_API_KEY);
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
