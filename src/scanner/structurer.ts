import { z } from "zod";
import {
  canUseAnthropicApi,
  collectAnthropicStructuredOutput,
} from "../agents/anthropic/anthropic-structured-output";
import {
  canUseOpenAiApi,
  collectOpenAiStructuredOutput,
} from "../agents/openai/openai-structured-output";
import type { ScannerProvider } from "./scanner-agent-runner";

/**
 * A Structurer takes free-form prose produced by an analyst agent and converts it into a typed
 * shape validated by a Zod schema. The structurer does no analysis of its own — it transcribes.
 */
export interface Structurer {
  readonly id: ScannerProvider;
  readonly label: string;
  available(): boolean;
  structure<T extends z.ZodTypeAny>(input: StructurerInput<T>): Promise<z.infer<T>>;
}

export interface StructurerInput<T extends z.ZodTypeAny> {
  /** The free-form analyst output to transcribe. */
  prose: string;
  /** Zod schema the output must satisfy. */
  schema: T;
  /** Short instruction describing what the analyst was asked to produce. */
  instructions: string;
  /** Optional abort signal. */
  signal?: AbortSignal;
}

const STRUCTURER_SYSTEM = [
  "You convert analyst prose into the requested structured shape.",
  "Do not add new analysis, opinions, or content not present in the prose.",
  "For every array field, enumerate exhaustively: if the prose lists, numbers, or describes items of that kind anywhere (including inside sections with different heading names, or inline in paragraphs), each distinct item MUST appear as a separate entry. Dropping items the prose discusses is a failure.",
  "Empty arrays and empty strings are only acceptable when the prose genuinely says nothing about that field.",
  'Match items to fields by meaning, not heading name — a prose section called "Threats", "Vulnerabilities", "Issues", or "Candidate Findings" all populate the same findings/threats array when the schema asks for one.',
  "Prefer including partial items (with whatever details the prose gives) over dropping them.",
  "Respect each field's declared type strictly. If the schema says a field is a string, emit a plain string — never an object, array, or wrapper like `{ text: ... }`. If the prose has structured detail for a string field, flatten it into a single sentence or semicolon-separated line rather than upgrading the type.",
].join(" ");

export const openAiStructurer: Structurer = {
  id: "codex",
  label: "OpenAI structurer",
  available: canUseOpenAiApi,
  async structure(input) {
    const jsonSchema = z.toJSONSchema(input.schema) as Record<string, unknown>;
    const raw = await collectOpenAiStructuredOutput({
      instructions: `${STRUCTURER_SYSTEM}\n\nAnalyst was asked to: ${input.instructions}`,
      input: `Analyst prose:\n${input.prose}`,
      outputSchema: jsonSchema,
      schemaName: "structured_output",
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (raw === undefined) {
      throw new Error("OpenAI structurer returned no output.");
    }
    return input.schema.parse(raw);
  },
};

export const anthropicStructurer: Structurer = {
  id: "claude",
  label: "Anthropic structurer",
  available: canUseAnthropicApi,
  async structure(input) {
    const jsonSchema = z.toJSONSchema(input.schema) as Record<string, unknown>;
    const raw = await collectAnthropicStructuredOutput({
      instructions: `${STRUCTURER_SYSTEM}\n\nAnalyst was asked to: ${input.instructions}`,
      input: `Analyst prose:\n${input.prose}`,
      outputSchema: jsonSchema,
      toolName: "submit_output",
      toolDescription: "Submit the structured output extracted from the analyst prose.",
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (raw === undefined) {
      throw new Error("Anthropic structurer returned no tool_use output.");
    }
    return input.schema.parse(raw);
  },
};

export function getStructurer(provider: ScannerProvider): Structurer {
  return provider === "codex" ? openAiStructurer : anthropicStructurer;
}
