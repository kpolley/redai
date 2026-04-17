import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact } from "../domain";
import { getRedaiArtifactsDir } from "../paths";
import type { ArtifactStore } from "./artifact-store";

export class FilesystemArtifactStore implements ArtifactStore {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? getRedaiArtifactsDir();
  }

  async put(runId: string, artifact: Artifact, content?: Uint8Array | string): Promise<Artifact> {
    const runDir = join(this.rootDir, runId);
    await mkdir(runDir, { recursive: true });
    if (content !== undefined && artifact.path) {
      await writeFile(join(runDir, artifact.path), content);
    }
    return artifact;
  }

  async list(): Promise<Artifact[]> {
    return [];
  }
}
