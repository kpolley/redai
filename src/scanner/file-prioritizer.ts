import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { FilePrioritization, ScanRun, ThreatModel } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface FilePrioritizerInput {
  run: ScanRun;
  threatModel: ThreatModel;
  candidatePaths: string[];
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface FilePrioritizer {
  prioritize(input: FilePrioritizerInput): Promise<FilePrioritization>;
}
