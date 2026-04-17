import { z } from "zod";
import { tolerantString } from "../scanner/zod-helpers";

const inlineEmbedSchema = z.object({
  /** Path of an evidence artifact from the provided list. Must match exactly. */
  artifactPath: tolerantString.default(""),
  /** Short reader-facing caption explaining why this artifact is being shown. */
  caption: tolerantString.default(""),
  /**
   * For text artifacts, an excerpt the agent extracted from the file (≤30 lines).
   * Empty for screenshots — the renderer uses image syntax instead.
   */
  snippet: tolerantString.default(""),
});

export const findingNarrativeAgentOutputSchema = z.object({
  /** Rewritten Description block prose. */
  description: tolerantString.default(""),
  /** Rewritten Exploit Scenario block prose. */
  exploitScenario: tolerantString.default(""),
  /** Rewritten Recommendations block prose. */
  recommendations: tolerantString.default(""),
  /** Up to a few artifacts to embed inline in the finding section. */
  inlineEmbeds: z.array(inlineEmbedSchema).default([]),
});

export type FindingNarrativeAgentOutput = z.infer<typeof findingNarrativeAgentOutputSchema>;
export type InlineEmbed = z.infer<typeof inlineEmbedSchema>;
