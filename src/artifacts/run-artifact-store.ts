import type { Artifact } from "../domain";

export interface RunArtifactStore {
  writeText(
    runId: string,
    relativePath: string,
    content: string,
    artifact: Omit<Artifact, "id" | "path" | "createdAt">,
  ): Promise<Artifact>;
  /** Absolute path to the run root (`~/.redai/runs/<runId>`). */
  runDir(runId: string): string;
  /** Absolute path to an artifact, given its `path` (e.g. `artifacts/aggregation/threat-model.json`). */
  resolveArtifact(runId: string, artifactPath: string): string;
}
