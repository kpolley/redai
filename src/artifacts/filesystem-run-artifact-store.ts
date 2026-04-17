import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Artifact } from "../domain";
import { getRedaiRunsDir } from "../paths";
import type { RunArtifactStore } from "./run-artifact-store";

export class FilesystemRunArtifactStore implements RunArtifactStore {
  private readonly absoluteRunsRootDir: string;

  constructor(runsRootDir?: string) {
    const resolved = runsRootDir ?? getRedaiRunsDir();
    this.absoluteRunsRootDir = isAbsolute(resolved) ? resolved : resolve(process.cwd(), resolved);
  }

  async writeText(
    runId: string,
    relativePath: string,
    content: string,
    artifact: Omit<Artifact, "id" | "path" | "createdAt">,
  ): Promise<Artifact> {
    const artifactPath = join("artifacts", relativePath);
    const absolutePath = join(this.runDir(runId), artifactPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    return {
      id: crypto.randomUUID(),
      path: artifactPath,
      createdAt: new Date().toISOString(),
      ...artifact,
    };
  }

  runDir(runId: string): string {
    return join(this.absoluteRunsRootDir, runId);
  }

  resolveArtifact(runId: string, artifactPath: string): string {
    return join(this.runDir(runId), artifactPath);
  }
}
