import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { AnalysisUnit, AnalysisUnitResult, Finding, ScanRun, ThreatModel } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface FindingAggregatorInput {
  run: ScanRun;
  threatModel: ThreatModel;
  analysisUnits: AnalysisUnit[];
  unitResults: AnalysisUnitResult[];
  candidateFindings: Finding[];
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface FindingAggregator {
  aggregateFindings(input: FindingAggregatorInput): Promise<Finding[]>;
}
