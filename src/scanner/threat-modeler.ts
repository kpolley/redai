import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { ScanRun, ThreatModel } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface ThreatModelerInput {
  run: ScanRun;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface ThreatModeler {
  buildThreatModel(input: ThreatModelerInput): Promise<ThreatModel>;
}
