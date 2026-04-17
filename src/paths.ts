import os from "node:os";
import { join } from "node:path";

/**
 * Resolves the RedAI home directory. Overridable via `REDAI_HOME`; defaults to `~/.redai`.
 *
 * All RedAI-owned state (runs, artifacts, validator environments) lives under this root so agents
 * see stable absolute paths regardless of their working directory.
 */
export function getRedaiHomeDir(): string {
  return process.env.REDAI_HOME && process.env.REDAI_HOME.length > 0
    ? process.env.REDAI_HOME
    : join(os.homedir(), ".redai");
}

export function getRedaiRunsDir(): string {
  return join(getRedaiHomeDir(), "runs");
}

export function getRedaiRunDir(runId: string): string {
  return join(getRedaiRunsDir(), runId);
}

export function getRedaiArtifactsDir(): string {
  return join(getRedaiHomeDir(), "artifacts");
}

export function getRedaiValidatorEnvironmentsDir(): string {
  return join(getRedaiHomeDir(), "validator-environments");
}

/**
 * Returns a user-friendly display form of an absolute path under the RedAI home, collapsing the
 * user's home prefix to `~` when possible. Falls back to the absolute path if it lives elsewhere.
 */
export function displayPath(absolutePath: string): string {
  const home = os.homedir();
  if (home && absolutePath.startsWith(`${home}/`)) {
    return `~${absolutePath.slice(home.length)}`;
  }
  return absolutePath;
}
