import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { Finding, ScanRun, ValidationResult } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";
import type { InlineEmbed } from "./finding-narrator-agent-output";

export interface FindingNarrative {
  findingId: string;
  description: string;
  exploitScenario: string;
  recommendations: string;
  inlineEmbeds: InlineEmbed[];
}

export interface FindingNarratorInput {
  run: ScanRun;
  finding: Finding;
  validationResult: ValidationResult | undefined;
  artifactStore: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface FindingNarrator {
  narrate(input: FindingNarratorInput): Promise<FindingNarrative>;
}
