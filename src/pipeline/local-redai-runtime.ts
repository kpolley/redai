import {
  defaultRunSettings,
  type ScanRun,
  type ScanRunState,
  type ScanRunSummary,
  type ScanTarget,
  type ValidatorEnvironment,
} from "../domain";
import type { RunEvent, Unsubscribe } from "./events";
import { FilesystemRunStore } from "./filesystem-run-store";
import { runPreflight } from "./preflight/run-preflight";
import type { CreateRunInput, RedaiRuntime } from "./project-session";
import type { RunStore } from "./run-store";
import { runScanPipeline } from "./scan-pipeline";
import { applyRunEvent, cancelActiveStages, emptyRunState } from "./state";
import {
  closeValidatorEnvironmentSetup,
  openValidatorEnvironmentSetup,
} from "./validator-environments/environment-setup";
import { FilesystemValidatorEnvironmentStore } from "./validator-environments/filesystem-validator-environment-store";
import type {
  CreateValidatorEnvironmentInput,
  ValidatorEnvironmentStore,
} from "./validator-environments/validator-environment-store";

export class LocalRedaiRuntime implements RedaiRuntime {
  private states = new Map<string, ScanRunState>();
  private listeners = new Set<(event: RunEvent) => void>();
  private activeRuns = new Map<string, AbortController>();
  private hydrated = false;

  constructor(
    private readonly store: RunStore = new FilesystemRunStore(),
    private readonly environmentStore: ValidatorEnvironmentStore = new FilesystemValidatorEnvironmentStore(),
  ) {}

  async listRuns(): Promise<ScanRunSummary[]> {
    await this.hydrate();
    return [...this.states.values()]
      .map((state) => ({
        ...state.run,
        findingCount: state.findings.length,
        confirmedCount: state.validationResults.filter((result) => result.status === "confirmed")
          .length,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRun(runId: string): Promise<ScanRunState | undefined> {
    await this.hydrate();
    return this.states.get(runId);
  }

  async createRun(input: CreateRunInput): Promise<ScanRun> {
    await this.hydrate();
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
    await this.store.createRun(run);
    await this.emit({ type: "run.created", run });
    return run;
  }

  async startRun(runId: string): Promise<void> {
    await this.hydrate();
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
    await this.hydrate();
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
    await this.hydrate();
    this.activeRuns.get(runId)?.abort();
    this.activeRuns.delete(runId);
    this.states.delete(runId);
    await this.store.deleteRun(runId);
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId,
        status: "canceled",
        updatedAt: new Date().toISOString(),
      });
  }

  async listValidatorEnvironments(): Promise<ValidatorEnvironment[]> {
    return this.environmentStore.listEnvironments();
  }

  async createValidatorEnvironment(
    input: CreateValidatorEnvironmentInput,
  ): Promise<ValidatorEnvironment> {
    const environment = await this.environmentStore.createEnvironment(input);
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
    await this.environmentStore.deleteEnvironment(environmentId);
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
    const environment = await this.environmentStore.getEnvironment(environmentId);
    if (!environment) return undefined;
    const updated = await this.environmentStore.updateEnvironment({
      ...environment,
      status: "setup",
    });
    try {
      const setupEnvironment = await openValidatorEnvironmentSetup(updated);
      await this.environmentStore.updateEnvironment(setupEnvironment);
    } catch (error) {
      await this.environmentStore.updateEnvironment({ ...updated, status: "failed" });
      throw error;
    }
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    return this.environmentStore.getEnvironment(environmentId);
  }

  async markValidatorEnvironmentReady(
    environmentId: string,
  ): Promise<ValidatorEnvironment | undefined> {
    const environment = await this.environmentStore.getEnvironment(environmentId);
    if (!environment) return undefined;
    await closeValidatorEnvironmentSetup(environment);
    const updated = await this.environmentStore.updateEnvironment({
      ...environment,
      status: "ready",
    });
    for (const listener of this.listeners)
      listener({
        type: "run.status.changed",
        runId: "environments",
        status: "draft",
        updatedAt: new Date().toISOString(),
      });
    return updated;
  }

  subscribe(listener: (event: RunEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const summaries = await this.store.listRuns();
    for (const summary of summaries) {
      const state = await this.store.getRun(summary.id);
      if (state) {
        const canceledAt = new Date().toISOString();
        const hydratedState =
          isActiveStatus(state.run.status) ||
          state.stages.some((stage) => ["queued", "running"].includes(stage.status))
            ? {
                ...state,
                run: { ...state.run, status: "canceled" as const, updatedAt: canceledAt },
                stages: cancelActiveStages(state.stages, canceledAt),
              }
            : state;
        this.states.set(hydratedState.run.id, hydratedState);
        if (hydratedState !== state) await this.store.saveSnapshot(hydratedState);
      }
    }
    this.hydrated = true;
  }

  private async emit(event: RunEvent): Promise<void> {
    const currentState =
      event.type === "run.created" ? emptyRunState(event.run) : this.states.get(event.runId);
    if (currentState) {
      const nextState = applyRunEvent(currentState, event);
      this.states.set(nextState.run.id, nextState);
      await this.store.appendEvent(event);
      await this.store.saveSnapshot(nextState);
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

function isActiveStatus(status: ScanRun["status"]): boolean {
  return ["queued", "scanning", "planning-validation", "validating", "cancel-pending"].includes(
    status,
  );
}

function defaultRunName(target: ScanTarget): string {
  if (target.kind === "website") return target.url;
  return target.path.split("/").filter(Boolean).at(-1) ?? target.kind;
}
