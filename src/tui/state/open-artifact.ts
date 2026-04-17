import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import type { Artifact } from "../../domain";
import { displayPath as displayAbsolutePath, getRedaiRunDir } from "../../paths";

export function artifactAbsolutePath(runId: string, artifact: Artifact): string | undefined {
  if (!artifact.path) return undefined;
  return join(getRedaiRunDir(runId), artifact.path);
}

export function artifactDisplayPath(runId: string, artifact: Artifact): string | undefined {
  const absolute = artifactAbsolutePath(runId, artifact);
  return absolute ? displayAbsolutePath(absolute) : undefined;
}

export async function openArtifact(runId: string, artifact: Artifact): Promise<void> {
  const absolutePath = artifactAbsolutePath(runId, artifact);
  if (!absolutePath) throw new Error("Artifact has no file path.");

  const allowedRoot = resolve(getRedaiRunDir(runId));
  if (!resolve(absolutePath).startsWith(allowedRoot)) {
    throw new Error("Refusing to open artifact outside this run directory.");
  }

  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", absolutePath] : [absolutePath];

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}
