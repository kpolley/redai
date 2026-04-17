import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ValidatorEnvironment } from "../../domain";
import { getRedaiValidatorEnvironmentsDir } from "../../paths";
import type {
  CreateValidatorEnvironmentInput,
  ValidatorEnvironmentStore,
} from "./validator-environment-store";

export class FilesystemValidatorEnvironmentStore implements ValidatorEnvironmentStore {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? getRedaiValidatorEnvironmentsDir();
  }

  async listEnvironments(): Promise<ValidatorEnvironment[]> {
    await mkdir(this.rootDir, { recursive: true });
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const environments = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.getEnvironment(entry.name)),
    );
    return environments
      .filter((environment): environment is ValidatorEnvironment => environment !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getEnvironment(environmentId: string): Promise<ValidatorEnvironment | undefined> {
    const path = this.environmentPath(environmentId);
    if (!existsSync(path)) return undefined;
    return JSON.parse(await readFile(path, "utf8")) as ValidatorEnvironment;
  }

  async createEnvironment(input: CreateValidatorEnvironmentInput): Promise<ValidatorEnvironment> {
    const now = new Date().toISOString();
    const environment: ValidatorEnvironment = {
      id: crypto.randomUUID(),
      name: input.name,
      kind: input.kind,
      status: input.status ?? "setup",
      createdAt: now,
      updatedAt: now,
      ...(input.browser
        ? {
            browser: {
              ...input.browser,
              profilePath: input.browser.profilePath || this.browserProfilePath(input.name),
            },
          }
        : {}),
      ...(input.ios ? { ios: input.ios } : {}),
    };
    await writeJson(this.environmentPath(environment.id), environment);
    return environment;
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await rm(this.environmentDir(environmentId), { recursive: true, force: true });
  }

  async updateEnvironment(environment: ValidatorEnvironment): Promise<ValidatorEnvironment> {
    const updated = { ...environment, updatedAt: new Date().toISOString() };
    await writeJson(this.environmentPath(environment.id), updated);
    return updated;
  }

  private environmentDir(environmentId: string): string {
    return join(this.rootDir, environmentId);
  }

  private environmentPath(environmentId: string): string {
    return join(this.environmentDir(environmentId), "environment.json");
  }

  private browserProfilePath(name: string): string {
    return resolve(this.rootDir, safePathPart(name), "browser-profile");
  }
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "environment";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
