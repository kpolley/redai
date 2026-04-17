import type { ScanRun } from "../../domain";

export function buildProjectBriefing(run: ScanRun): string {
  if (run.target.kind === "source-directory") {
    return [
      `Target source directory: ${run.target.path}`,
      "Explore the source tree directly to understand architecture, assets, trust boundaries, entrypoints, and data flows.",
      "Identify relevant areas from the code and project structure.",
    ].join("\n");
  }

  return `Target: ${JSON.stringify(run.target)}`;
}
