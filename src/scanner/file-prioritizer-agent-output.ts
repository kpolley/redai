import { z } from "zod";
import type { FilePrioritization, FilePriority } from "../domain";
import { filePriorityCategorySchema } from "../domain";
import { tolerantString, tolerantStringArray } from "./zod-helpers";

const filePriorityAgentSchema = z.object({
  path: tolerantString.default(""),
  score: z.number().default(0),
  rationale: tolerantString.default(""),
  category: tolerantString.default(""),
});

export const filePrioritizationAgentOutputSchema = z.object({
  prioritized: z.array(filePriorityAgentSchema).default([]),
  excluded: tolerantStringArray(),
  notes: tolerantString.default(""),
});
export type FilePrioritizationAgentOutput = z.infer<typeof filePrioritizationAgentOutputSchema>;

export interface NormalizeFilePrioritizationInput {
  output: FilePrioritizationAgentOutput;
  knownPaths: ReadonlySet<string>;
  totalFiles: number;
  transcriptRef?: string;
}

export function normalizeFilePrioritizationOutput(
  input: NormalizeFilePrioritizationInput,
): FilePrioritization {
  const seen = new Set<string>();
  const prioritized: FilePriority[] = [];
  for (const entry of input.output.prioritized) {
    const path = resolveKnownPath(entry.path, input.knownPaths);
    if (!path) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const score = clampScore(entry.score);
    const category = parseCategory(entry.category);
    prioritized.push({
      path,
      score,
      rationale: entry.rationale.trim(),
      ...(category ? { category } : {}),
    });
  }
  const excluded = Array.from(
    new Set(
      input.output.excluded
        .map((path) => resolveKnownPath(path, input.knownPaths))
        .filter((path): path is string => Boolean(path && !seen.has(path))),
    ),
  );
  return {
    generatedAt: new Date().toISOString(),
    totalFiles: input.totalFiles,
    prioritized: prioritized.sort((a, b) => b.score - a.score),
    excluded,
    notes: input.output.notes.trim(),
    ...(input.transcriptRef ? { transcriptRef: input.transcriptRef } : {}),
  };
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolveKnownPath(value: string, knownPaths: ReadonlySet<string>): string | undefined {
  const path = value.trim();
  if (!path) return undefined;
  if (knownPaths.has(path)) return path;

  const withoutLocation = stripLocationSuffix(path);
  if (withoutLocation && knownPaths.has(withoutLocation)) return withoutLocation;

  if (path.startsWith("./")) {
    const withoutDotSlash = path.slice(2);
    if (knownPaths.has(withoutDotSlash)) return withoutDotSlash;
    const withoutDotSlashLocation = stripLocationSuffix(withoutDotSlash);
    if (withoutDotSlashLocation && knownPaths.has(withoutDotSlashLocation)) {
      return withoutDotSlashLocation;
    }
  }

  return undefined;
}

function stripLocationSuffix(path: string): string | undefined {
  return path.match(/^(.+?)(?::\d+){1,2}$/)?.[1];
}

function parseCategory(value: string): FilePriority["category"] | undefined {
  const normalized = value.trim().toLowerCase();
  const parsed = filePriorityCategorySchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}
