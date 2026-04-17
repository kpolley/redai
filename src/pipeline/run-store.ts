import type { ScanRun, ScanRunState, ScanRunSummary } from "../domain";
import type { RunEvent } from "./events";

export interface RunStore {
  listRuns(): Promise<ScanRunSummary[]>;
  getRun(runId: string): Promise<ScanRunState | undefined>;
  createRun(run: ScanRun): Promise<void>;
  appendEvent(event: RunEvent): Promise<void>;
  loadEvents(runId: string): Promise<RunEvent[]>;
  saveSnapshot(state: ScanRunState): Promise<void>;
  deleteRun(runId: string): Promise<void>;
}
