import { join } from "node:path";
import {
  defaultRunSettings,
  type RunSettings,
  type ScanRun,
  type ScanRunState,
  type ScanRunSummary,
  type ScanTarget,
  type ValidatorEnvironment,
} from "../domain";
import { getRedaiValidatorEnvironmentsDir } from "../paths";
import type { RunEvent, Unsubscribe } from "./events";
import { runPreflight } from "./preflight/run-preflight";
import { runScanPipeline } from "./scan-pipeline";
import { applyRunEvent, emptyRunState } from "./state";
import {
  closeValidatorEnvironmentSetup,
  openValidatorEnvironmentSetup,
} from "./validator-environments/environment-setup";
import type { CreateValidatorEnvironmentInput } from "./validator-environments/validator-environment-store";

export interface CreateRunInput {
  name?: string;
  target: ScanTarget;
  settings?: Partial<RunSettings>;
}

export interface RedaiRuntime {
  listRuns(): Promise<ScanRunSummary[]>;
  getRun(runId: string): Promise<ScanRunState | undefined>;
  listValidatorEnvironments(): Promise<ValidatorEnvironment[]>;
  createValidatorEnvironment(input: CreateValidatorEnvironmentInput): Promise<ValidatorEnvironment>;
  startValidatorEnvironmentSetup(environmentId: string): Promise<ValidatorEnvironment | undefined>;
  markValidatorEnvironmentReady(environmentId: string): Promise<ValidatorEnvironment | undefined>;
  deleteValidatorEnvironment(environmentId: string): Promise<void>;
  createRun(input: CreateRunInput): Promise<ScanRun>;
  startRun(runId: string): Promise<void>;
  resumeRun(runId: string): Promise<ScanRun | undefined>;
  cancelRun(runId: string): Promise<void>;
  deleteRun(runId: string): Promise<void>;
  subscribe(listener: (event: RunEvent) => void): Unsubscribe;
}

export class InMemoryRedaiRuntime implements RedaiRuntime {
  private states = new Map<string, ScanRunState>();
  private environments = new Map<string, ValidatorEnvironment>();
  private listeners = new Set<(event: RunEvent) => void>();
  private activeRuns = new Map<string, AbortController>();

  async listRuns(): Promise<ScanRunSummary[]> {
    return [...this.states.values()].map((state) => ({
      ...state.run,
      findingCount: state.findings.length,
      confirmedCount: state.validationResults.filter((result) => result.status === "confirmed")
        .length,
    }));
  }

  async getRun(runId: string): Promise<ScanRunState | undefined> {
    return this.states.get(runId);
  }

  async createRun(input: CreateRunInput): Promise<ScanRun> {
    const now = new Date().toISOString();
    const run: ScanRun = {
      id: crypto.randomUUID(),
      name: input.name ?? defaultRunName(input.target),
      target: input.target,
      settings: { ...defaultRunSettings, ...input.settings },
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await this.emit({ type: "run.created", run });
    return run;
  }

  async startRun(runId: string): Promise<void> {
    const state = this.states.get(runId);
    if (!state) return;
    const preflight = await runPreflight(state.run);
    for (const warning of preflight.warnings) {
      await this.emitActivity(runId, "warn", `Preflight warning: ${warning}`);
    }
    if (!preflight.ok) {
      for (const error of preflight.errors) {
        await this.emitActivity(runId, "error", `Preflight failed: ${error}`);
      }
      await this.emit({
        type: "run.failed",
        runId,
        message: preflight.errors.join("; "),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const controller = new AbortController();
    this.activeRuns.set(runId, controller);
    void runScanPipeline({
      run: state.run,
      emit: (event) => this.emit(event),
      signal: controller.signal,
    }).finally(() => this.activeRuns.delete(runId));
  }

  async resumeRun(runId: string): Promise<ScanRun | undefined> {
    const state = this.states.get(runId);
    if (!state) return undefined;
    await this.startRun(runId);
    return state.run;
  }

  async cancelRun(runId: string): Promise<void> {
    const controller = this.activeRuns.get(runId);
    if (!controller) return;
    controller.abort();
    await this.emitActivity(
      runId,
      "warn",
      "Cancel requested; waiting for active agent work to yield.",
    );
    await this.emit({
      type: "run.status.changed",
      runId,
      status: "cancel-pending",
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteRun(runId: string): Promise<void> {
    this.activeRuns.get(runId)?.abort();
    this.activeRuns.delete(runId);
    this.states.delete(runId);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId,
        status: "canceled",
        updatedAt: new Date().toISOString(),
      });
  }

  async listValidatorEnvironments(): Promise<ValidatorEnvironment[]> {
    return [...this.environments.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async createValidatorEnvironment(
    input: CreateValidatorEnvironmentInput,
  ): Promise<ValidatorEnvironment> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const environment = {
      id,
      name: input.name,
      kind: input.kind,
      status: input.status ?? "setup",
      createdAt: now,
      updatedAt: now,
      ...(input.browser
        ? {
            browser: {
              ...input.browser,
              profilePath:
                input.browser.profilePath ||
                join(getRedaiValidatorEnvironmentsDir(), id, "browser-profile"),
            },
          }
        : {}),
      ...(input.ios ? { ios: input.ios } : {}),
    } satisfies ValidatorEnvironment;
    this.environments.set(environment.id, environment);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    return environment;
  }

  async deleteValidatorEnvironment(environmentId: string): Promise<void> {
    this.environments.delete(environmentId);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
  }

  async startValidatorEnvironmentSetup(
    environmentId: string,
  ): Promise<ValidatorEnvironment | undefined> {
    const environment = this.environments.get(environmentId);
    if (!environment) return undefined;
    const nextEnvironment = {
      ...environment,
      status: "setup",
      updatedAt: new Date().toISOString(),
    } satisfies ValidatorEnvironment;
    this.environments.set(environmentId, nextEnvironment);
    const setupEnvironment = await openValidatorEnvironmentSetup(nextEnvironment);
    this.environments.set(environmentId, setupEnvironment);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    return setupEnvironment;
  }

  async markValidatorEnvironmentReady(
    environmentId: string,
  ): Promise<ValidatorEnvironment | undefined> {
    const environment = this.environments.get(environmentId);
    if (!environment) return undefined;
    await closeValidatorEnvironmentSetup(environment);
    const nextEnvironment = {
      ...environment,
      status: "ready",
      updatedAt: new Date().toISOString(),
    } satisfies ValidatorEnvironment;
    this.environments.set(environmentId, nextEnvironment);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    return nextEnvironment;
  }

  subscribe(listener: (event: RunEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(event: RunEvent): Promise<void> {
    const currentState =
      event.type === "run.created" ? emptyRunState(event.run) : this.states.get(event.runId);
    if (currentState) {
      this.states.set(currentState.run.id, applyRunEvent(currentState, event));
    }
    for (const listener of this.listeners) listener(event);
  }

  private async emitActivity(
    runId: string,
    level: "info" | "warn" | "error",
    message: string,
  ): Promise<void> {
    await this.emit({
      type: "run.activity",
      runId,
      activity: { id: crypto.randomUUID(), level, message, createdAt: new Date().toISOString() },
    });
  }
}

function defaultRunName(target: ScanTarget): string {
  if (target.kind === "website") return target.url;
  return target.path.split("/").filter(Boolean).at(-1) ?? target.kind;
}
