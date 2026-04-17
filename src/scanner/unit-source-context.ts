import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnalysisUnit, ScanRun } from "../domain";

export interface UnitSourceContext {
  primaryFile: string;
  excerpt: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
}

export async function loadUnitSourceContext(
  run: ScanRun,
  unit: AnalysisUnit,
): Promise<UnitSourceContext | undefined> {
  if (run.target.kind !== "source-directory") return undefined;
  const primaryFile = unit.location.path || unit.relatedFiles[0];
  if (!primaryFile) return undefined;

  try {
    const content = await readFile(join(run.target.path, primaryFile), "utf8");
    return buildExcerpt(primaryFile, content, unit.location.line);
  } catch {
    return undefined;
  }
}

function buildExcerpt(
  primaryFile: string,
  content: string,
  line: number | undefined,
): UnitSourceContext {
  const lines = content.split(/\r?\n/);
  const maxLines = 180;
  const centerLine = line && line > 0 ? line : 1;
  const halfWindow = Math.floor(maxLines / 2);
  const startLine = Math.max(1, centerLine - halfWindow);
  const endLine = Math.min(lines.length, startLine + maxLines - 1);
  const selected = lines.slice(startLine - 1, endLine);
  const excerpt = selected
    .map((text, index) => `${String(startLine + index).padStart(5, " ")} | ${text}`)
    .join("\n");

  return {
    primaryFile,
    excerpt,
    startLine,
    endLine,
    truncated: startLine > 1 || endLine < lines.length,
  };
}
