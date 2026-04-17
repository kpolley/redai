import type { ScanRunState } from "./run";

export interface FinalReport {
  runId: string;
  generatedAt: string;
  state: ScanRunState;
}
