import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ScanRun, ScanRunState, ScanRunSummary } from "../domain";
import { getRedaiRunsDir } from "../paths";
import type { RunEvent } from "./events";
import type { RunStore } from "./run-store";
import { applyRunEvent, emptyRunState } from "./state";

export class FilesystemRunStore implements RunStore {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? getRedaiRunsDir();
  }

  async listRuns(): Promise<ScanRunSummary[]> {
    await mkdir(this.rootDir, { recursive: true });
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const states = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => this.getRun(entry.name)),
    );

    return states
      .filter((state): state is ScanRunState => state !== undefined)
      .map((state) => ({
        ...state.run,
        findingCount: state.findings.length,
        confirmedCount: state.validationResults.filter((result) => result.status === "confirmed")
          .length,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getRun(runId: string): Promise<ScanRunState | undefined> {
    const snapshotPath = this.snapshotPath(runId);
    if (existsSync(snapshotPath)) {
      return JSON.parse(await readFile(snapshotPath, "utf8")) as ScanRunState;
    }

    const events = await this.loadEvents(runId);
    if (events.length === 0) return undefined;

    const firstEvent = events[0];
    if (firstEvent?.type !== "run.created") return undefined;

    const state = events
      .slice(1)
      .reduce(
        (currentState, event) => applyRunEvent(currentState, event),
        emptyRunState(firstEvent.run),
      );
    await this.saveSnapshot(state);
    return state;
  }

  async createRun(run: ScanRun): Promise<void> {
    await mkdir(this.runDir(run.id), { recursive: true });
    await writeJson(this.runPath(run.id), run);
  }

  async appendEvent(event: RunEvent): Promise<void> {
    const runId = event.type === "run.created" ? event.run.id : event.runId;
    await mkdir(this.runDir(runId), { recursive: true });
    await appendFile(this.eventsPath(runId), `${JSON.stringify(event)}\n`, "utf8");
  }

  async loadEvents(runId: string): Promise<RunEvent[]> {
    const eventsPath = this.eventsPath(runId);
    if (!existsSync(eventsPath)) return [];
    const content = await readFile(eventsPath, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunEvent);
  }

  async saveSnapshot(state: ScanRunState): Promise<void> {
    await mkdir(this.runDir(state.run.id), { recursive: true });
    await writeJson(this.snapshotPath(state.run.id), state);
  }

  async deleteRun(runId: string): Promise<void> {
    await rm(this.runDir(runId), { recursive: true, force: true });
  }

  private runDir(runId: string): string {
    return join(this.rootDir, runId);
  }

  private runPath(runId: string): string {
    return join(this.runDir(runId), "run.json");
  }

  private eventsPath(runId: string): string {
    return join(this.runDir(runId), "events.ndjson");
  }

  private snapshotPath(runId: string): string {
    return join(this.runDir(runId), "state.json");
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
