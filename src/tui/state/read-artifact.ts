import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Artifact } from "../../domain";
import { getRedaiRunDir } from "../../paths";
import { artifactAbsolutePath } from "./open-artifact";

export interface ArtifactPreview {
  content: string;
}

export async function readArtifactPreview(
  runId: string,
  artifact: Artifact,
): Promise<ArtifactPreview> {
  const absolutePath = artifactAbsolutePath(runId, artifact);
  if (!absolutePath) throw new Error("Artifact has no file path.");

  const allowedRoot = resolve(getRedaiRunDir(runId));
  if (!resolve(absolutePath).startsWith(allowedRoot)) {
    throw new Error("Refusing to read artifact outside this run directory.");
  }

  return {
    content: await readFile(absolutePath, "utf8"),
  };
}
