import { discoverAnalysisUnits } from "../analysis/analysis-unit-discoverer";
import { FilesystemRunArtifactStore } from "../artifacts/filesystem-run-artifact-store";
import type {
  AnalysisUnit,
  AnalysisUnitResult,
  Artifact,
  FilePrioritization,
  Finding,
  RunStageId,
  RunStageStatus,
  ScanRun,
  ScanRunState,
  ThreatModel,
  ValidationPlan,
  ValidationResult,
} from "../domain";
import { DefaultValidationPlanner } from "../planner/default-validation-planner";
import { FilesystemReportWriter } from "../reporting/filesystem-report-writer";
import type { FindingNarrative } from "../reporting/finding-narrator";
import { StructuredFindingNarrator } from "../reporting/structured-finding-narrator";
import { getScannerAgentRunner, type ScannerProvider } from "../scanner/scanner-agent-runner";
import { walkSourceFiles } from "../scanner/source-file-walker";
import { StructuredFilePrioritizer } from "../scanner/structured-file-prioritizer";
import { StructuredFindingAggregator } from "../scanner/structured-finding-aggregator";
import { StructuredFindingScanner } from "../scanner/structured-finding-scanner";
import { StructuredThreatModeler } from "../scanner/structured-threat-modeler";
import { StructuredUnitScanner } from "../scanner/structured-unit-scanner";
import type { UnitScanner, UnitScannerOutput } from "../scanner/unit-scanner";
import { loadUnitSourceContext } from "../scanner/unit-source-context";
import { mapConcurrent } from "../utils/map-concurrent";
import { pluralize } from "../utils/pluralize";
import { iosSimulatorValidator } from "../validators/ios-simulator";
import { PluginValidationExecutor } from "../validators/plugin-validation-executor";
import { webAgentBrowserValidator } from "../validators/web-agent-browser";
import type { RunEventEmitter } from "./events";

interface PipelineInput {
  run: ScanRun;
  emit: RunEventEmitter;
  signal?: AbortSignal;
}

export async function runScanPipeline({ run, emit, signal }: PipelineInput): Promise<void> {
  await emitActivity(emit, run.id, "info", "Starting scan run.");
  await emit({ type: "scan.started", runId: run.id });
  try {
    throwIfCanceled(signal);
    await delay(350, signal);

    await startStage(emit, run.id, "threat-model", "Building threat model.");
    await emitActivity(emit, run.id, "info", scannerStageMessage(run, "threat-model"));
    await emit({ type: "threatModel.started", runId: run.id });
    await delay(250, signal);
    const artifactStore = new FilesystemRunArtifactStore();
    const threatModel = await buildThreatModel(run, emit, artifactStore);
    throwIfCanceled(signal);
    await emit({ type: "threatModel.completed", runId: run.id, threatModel });
    await emitActivity(
      emit,
      run.id,
      "info",
      `Threat model completed with ${pluralize(threatModel.threats.length, "threat")}.`,
    );
    await completeStage(
      emit,
      run.id,
      "threat-model",
      `${pluralize(threatModel.threats.length, "threat")} modeled.`,
      threatModel.threats.length,
    );
    await delay(350, signal);

    let filePrioritization: FilePrioritization | undefined;
    if (run.target.kind === "source-directory") {
      await startStage(emit, run.id, "file-prioritization", "Prioritizing source files.");
      filePrioritization = await runFilePrioritizationStage(
        run,
        threatModel,
        emit,
        artifactStore,
        signal,
      );
      await completeStage(
        emit,
        run.id,
        "file-prioritization",
        prioritizationStageMessage(filePrioritization, run.settings.scanCoverage),
        filePrioritization?.prioritized.length,
        filePrioritization?.totalFiles,
      );
      await delay(250, signal);
    } else {
      await startStage(emit, run.id, "file-prioritization", "Skipping prioritization.");
      await completeStage(
        emit,
        run.id,
        "file-prioritization",
        "Skipped: target is not a source directory.",
      );
    }

    await startStage(emit, run.id, "analysis-discovery", "Discovering analysis units.");
    const analysisUnits =
      run.target.kind === "source-directory"
        ? await discoverAnalysisUnits({
            rootDir: run.target.path,
            threatModel,
            ...(filePrioritization ? { filePrioritization } : {}),
            scanCoverage: run.settings.scanCoverage,
          })
        : [];
    for (const unit of analysisUnits) {
      throwIfCanceled(signal);
      await emit({ type: "analysisUnit.discovered", runId: run.id, unit });
      await emit({
        type: "stage.progress",
        runId: run.id,
        stageId: "analysis-discovery",
        current: analysisUnits.indexOf(unit) + 1,
        total: analysisUnits.length,
        message: unit.title,
      });
      await delay(25, signal);
    }
    await emit({
      type: "analysisUnit.discovery.completed",
      runId: run.id,
      count: analysisUnits.length,
    });
    await emitActivity(
      emit,
      run.id,
      "info",
      `Discovered ${pluralize(analysisUnits.length, "analysis unit")}.`,
    );
    await completeStage(
      emit,
      run.id,
      "analysis-discovery",
      `${pluralize(analysisUnits.length, "unit")} discovered.`,
      analysisUnits.length,
      analysisUnits.length,
    );
    await delay(350, signal);

    await startStage(emit, run.id, "unit-scanning", "Scanning analysis units.");
    await emitActivity(emit, run.id, "info", unitScannerMessage(run, analysisUnits.length));
    const unitScanOutput = await scanAnalysisUnits(run, threatModel, analysisUnits, emit, signal);
    await emitActivity(
      emit,
      run.id,
      "info",
      `Unit scanning completed with ${pluralize(unitScanOutput.candidateFindings.length, "candidate finding")}.`,
    );
    await completeStage(
      emit,
      run.id,
      "unit-scanning",
      `${pluralize(unitScanOutput.results.length, "unit")} scanned.`,
      unitScanOutput.results.length,
      unitScanOutput.results.length,
    );

    await startStage(emit, run.id, "finding-aggregation", "Aggregating findings.");
    const findings =
      unitScanOutput.candidateFindings.length > 0
        ? await aggregateFindings(
            run,
            threatModel,
            analysisUnits,
            unitScanOutput.results,
            unitScanOutput.candidateFindings,
            emit,
            artifactStore,
          )
        : await buildFindings(run, threatModel, emit, artifactStore);
    throwIfCanceled(signal);
    await emitActivity(
      emit,
      run.id,
      "info",
      `Generated ${pluralize(findings.length, "final finding")}.`,
    );
    for (const finding of findings) {
      await emit({ type: "finding.created", runId: run.id, finding });
      await delay(150, signal);
    }
    await completeStage(
      emit,
      run.id,
      "finding-aggregation",
      `${pluralize(findings.length, "finding")} generated.`,
      findings.length,
    );

    await startStage(emit, run.id, "validation", "Validating findings.");
    const validationOutput = await runValidationStage(run, findings, emit, signal);
    await completeStage(
      emit,
      run.id,
      "validation",
      `${validationOutput.results.length} validation results.`,
      validationOutput.results.length,
      validationOutput.plans.length,
    );
    await delay(250, signal);

    await startStage(emit, run.id, "reporting", "Writing final reports.");
    const narratives = await runReportNarrationStage(
      run,
      findings,
      validationOutput.results,
      artifactStore,
      emit,
      signal,
    );
    await writeFinalReports(
      {
        run,
        threatModel,
        analysisUnits,
        unitResults: unitScanOutput.results,
        findings,
        validationPlans: validationOutput.plans,
        validationResults: validationOutput.results,
        narratives,
        ...(filePrioritization ? { filePrioritization } : {}),
      },
      emit,
    );
    await completeStage(emit, run.id, "reporting", "Reports generated.");
    await emitActivity(emit, run.id, "info", "Scan run completed.");
    await emit({ type: "run.completed", runId: run.id, updatedAt: new Date().toISOString() });
  } catch (error) {
    if (isAbortError(error)) {
      await emitActivity(emit, run.id, "warn", "Scan run canceled.");
      await emit({
        type: "run.status.changed",
        runId: run.id,
        status: "canceled",
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    await emitActivity(
      emit,
      run.id,
      "error",
      `Scan run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    await emit({
      type: "run.failed",
      runId: run.id,
      message: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    });
  }
}

interface ReportStageInput {
  run: ScanRun;
  threatModel: ThreatModel;
  analysisUnits: AnalysisUnit[];
  unitResults: AnalysisUnitResult[];
  findings: Finding[];
  validationPlans: ValidationPlan[];
  validationResults: ValidationResult[];
  filePrioritization?: FilePrioritization;
  narratives?: Map<string, FindingNarrative>;
}

async function writeFinalReports(
  input: ReportStageInput,
  emit: RunEventEmitter,
): Promise<Artifact[]> {
  const state: ScanRunState = {
    run: { ...input.run, status: "completed", updatedAt: new Date().toISOString() },
    stages: [],
    activity: [],
    threatModel: input.threatModel,
    ...(input.filePrioritization ? { filePrioritization: input.filePrioritization } : {}),
    analysisUnits: input.analysisUnits,
    analysisUnitResults: input.unitResults,
    artifacts: validationArtifacts(input.validationResults),
    findings: input.findings,
    validationPlans: input.validationPlans,
    validationJobs: [],
    validationResults: input.validationResults,
  };
  const writer = new FilesystemReportWriter();
  const reports = await writer.writeReports(state, {
    ...(input.narratives ? { narratives: input.narratives } : {}),
  });
  await emit({
    type: "artifact.created",
    runId: input.run.id,
    jobId: "report",
    artifact: reports.markdownArtifact,
  });
  await emit({
    type: "artifact.created",
    runId: input.run.id,
    jobId: "report",
    artifact: reports.jsonArtifact,
  });
  await emit({
    type: "artifact.created",
    runId: input.run.id,
    jobId: "report",
    artifact: reports.htmlArtifact,
  });
  await emitActivity(
    emit,
    input.run.id,
    "info",
    "Generated report.md, report.json, and report.html.",
  );
  return [reports.markdownArtifact, reports.jsonArtifact, reports.htmlArtifact];
}

function validationArtifacts(results: ValidationResult[]): Artifact[] {
  const artifacts: Artifact[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    for (const artifact of result.evidence) {
      const key = artifact.path ?? artifact.id;
      if (seen.has(key)) continue;
      seen.add(key);
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

interface ValidationStageOutput {
  plans: ValidationPlan[];
  results: ValidationResult[];
}

async function runValidationStage(
  run: ScanRun,
  findings: Finding[],
  emit: RunEventEmitter,
  signal?: AbortSignal,
): Promise<ValidationStageOutput> {
  const planner = new DefaultValidationPlanner();
  const executor = new PluginValidationExecutor([
    webAgentBrowserValidator(),
    iosSimulatorValidator(),
  ]);
  const plans = await planner.createPlans({ run, findings });
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const executablePlans = plans
    .map((plan) => ({ plan, finding: findingsById.get(plan.findingId) }))
    .filter((item): item is { plan: ValidationPlan; finding: Finding } => Boolean(item.finding));
  const validationConcurrency = Math.max(
    1,
    Math.min(run.settings.validatorAgentConcurrency, executablePlans.length || 1),
  );
  let completedCount = 0;

  const results = await mapConcurrent(
    executablePlans,
    validationConcurrency,
    async ({ plan, finding }) => {
      await emitActivity(
        emit,
        run.id,
        "info",
        `Planning validation for finding: ${finding.title}.`,
      );
      await emit({ type: "validation.plan.created", runId: run.id, findingId: finding.id, plan });
      await delay(150, signal);

      await emitActivity(
        emit,
        run.id,
        "info",
        `Starting validation for finding: ${finding.title}.`,
      );
      throwIfCanceled(signal);
      const result = await executor.run({ run, finding, plan, emit });
      throwIfCanceled(signal);
      completedCount += 1;
      await emit({
        type: "validation.completed",
        runId: run.id,
        findingId: finding.id,
        result,
        jobId: plan.id,
      });
      await emitActivity(
        emit,
        run.id,
        "info",
        `Validation completed for finding: ${finding.title}.`,
      );
      await emit({
        type: "stage.progress",
        runId: run.id,
        stageId: "validation",
        current: completedCount,
        total: executablePlans.length,
        message: finding.title,
      });
      return result;
    },
  );

  return { plans, results };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

async function buildThreatModel(
  run: ScanRun,
  emit: RunEventEmitter,
  artifactStore: FilesystemRunArtifactStore,
): Promise<ThreatModel> {
  const runner = getScannerAgentRunner(selectScannerProvider(run, "threat-model"));
  return new StructuredThreatModeler(runner).buildThreatModel({ run, artifactStore, emit });
}

async function buildFindings(
  run: ScanRun,
  threatModel: ThreatModel,
  emit: RunEventEmitter,
  artifactStore: FilesystemRunArtifactStore,
): Promise<Finding[]> {
  const runner = getScannerAgentRunner(selectScannerProvider(run, "finding-scan"));
  return new StructuredFindingScanner(runner).findVulnerabilities({
    run,
    threatModel,
    artifactStore,
    emit,
  });
}

interface UnitScanPipelineOutput {
  results: AnalysisUnitResult[];
  candidateFindings: Finding[];
}

async function scanAnalysisUnits(
  run: ScanRun,
  threatModel: ThreatModel,
  analysisUnits: AnalysisUnit[],
  emit: RunEventEmitter,
  signal?: AbortSignal,
): Promise<UnitScanPipelineOutput> {
  const runner = getScannerAgentRunner(selectScannerProvider(run, "unit-scan"));
  const artifactStore = new FilesystemRunArtifactStore();
  const scanner = new StructuredUnitScanner(runner);
  const unitsToScan = analysisUnits;
  const concurrency = run.settings.unitAgentConcurrency;
  let completedCount = 0;

  const outputs = await mapConcurrent(unitsToScan, concurrency, async (unit, index) => {
    throwIfCanceled(signal);
    await emitActivity(
      emit,
      run.id,
      "info",
      `Scanning unit ${index + 1}/${unitsToScan.length}: ${unit.title}.`,
    );
    await emit({ type: "analysisUnit.started", runId: run.id, unitId: unit.id });
    try {
      const output = await scanUnitWithRetry({
        run,
        threatModel,
        unit,
        scanner,
        artifactStore,
        emit,
        ...(signal ? { signal } : {}),
      });
      throwIfCanceled(signal);
      completedCount += 1;
      await emit({
        type: "analysisUnit.completed",
        runId: run.id,
        result: output.result,
        candidateFindings: output.candidateFindings,
      });
      await emit({
        type: "stage.progress",
        runId: run.id,
        stageId: "unit-scanning",
        current: completedCount,
        total: unitsToScan.length,
        message: unit.title,
      });
      await emitActivity(
        emit,
        run.id,
        "info",
        `Completed unit ${completedCount}/${unitsToScan.length}: ${unit.title} (${pluralize(output.candidateFindings.length, "candidate")}).`,
      );
      return output;
    } catch (error) {
      completedCount += 1;
      const result: AnalysisUnitResult = {
        unitId: unit.id,
        status: "failed",
        summary: "Analysis unit scanner failed.",
        securityObservations: [],
        candidateFindingIds: [],
        followUpUnitIds: [],
        error: error instanceof Error ? error.message : String(error),
      };
      await emit({ type: "analysisUnit.failed", runId: run.id, result });
      await emit({
        type: "stage.progress",
        runId: run.id,
        stageId: "unit-scanning",
        current: completedCount,
        total: unitsToScan.length,
        message: unit.title,
      });
      await emitActivity(
        emit,
        run.id,
        "error",
        `Failed unit ${completedCount}/${unitsToScan.length}: ${unit.title}.`,
      );
      return { result, candidateFindings: [] };
    }
  });

  return {
    results: outputs.map((output) => output.result),
    candidateFindings: outputs.flatMap((output) => output.candidateFindings),
  };
}

interface ScanUnitWithRetryInput {
  run: ScanRun;
  threatModel: ThreatModel;
  unit: AnalysisUnit;
  scanner: UnitScanner;
  artifactStore: FilesystemRunArtifactStore;
  emit: RunEventEmitter;
  signal?: AbortSignal;
}

async function scanUnitWithRetry(input: ScanUnitWithRetryInput): Promise<UnitScannerOutput> {
  const attempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1)
        await emitActivity(
          input.emit,
          input.run.id,
          "warn",
          `Retrying unit scan ${attempt}/${attempts}: ${input.unit.title}.`,
        );
      const sourceContext = await loadUnitSourceContext(input.run, input.unit);
      return await withTimeout(
        input.scanner.scanUnit({
          run: input.run,
          threatModel: input.threatModel,
          unit: input.unit,
          ...(sourceContext ? { sourceContext } : {}),
          artifactStore: input.artifactStore,
          emit: input.emit,
        }),
        unitScanTimeoutMs(),
        `Unit scan timed out for ${input.unit.title}.`,
        input.signal,
      );
    } catch (error) {
      throwIfCanceled(input.signal);
      lastError = error;
      if (attempt < attempts) continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function unitScanTimeoutMs(): number {
  return Number(process.env.REDAI_UNIT_SCAN_TIMEOUT_MS ?? 5 * 60 * 1000);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

type ScannerStage =
  | "threat-model"
  | "file-prioritization"
  | "finding-scan"
  | "unit-scan"
  | "aggregation"
  | "report-narration";

function selectScannerProvider(run: ScanRun, stage: ScannerStage): ScannerProvider {
  const provider = run.settings.scannerProvider;
  const runner = getScannerAgentRunner(provider);
  if (!runner.available()) {
    throw new Error(`${runner.label} is not configured for ${scannerStageLabel(stage)}.`);
  }
  return provider;
}

function unitScannerMessage(run: ScanRun, unitCount: number): string {
  const runner = getScannerAgentRunner(selectScannerProvider(run, "unit-scan"));
  return `Scanning ${pluralize(unitCount, "unit")} with ${runner.label}.`;
}

function scannerStageMessage(run: ScanRun, stage: ScannerStage): string {
  const runner = getScannerAgentRunner(selectScannerProvider(run, stage));
  return `${scannerStageLabel(stage)} with ${runner.label}.`;
}

function scannerStageLabel(stage: ScannerStage): string {
  if (stage === "threat-model") return "Threat modeling";
  if (stage === "file-prioritization") return "File prioritization";
  if (stage === "finding-scan") return "Finding scanning";
  if (stage === "unit-scan") return "Unit scanning";
  if (stage === "report-narration") return "Report narration";
  return "Finding aggregation";
}

async function runFilePrioritizationStage(
  run: ScanRun,
  threatModel: ThreatModel,
  emit: RunEventEmitter,
  artifactStore: FilesystemRunArtifactStore,
  signal?: AbortSignal,
): Promise<FilePrioritization | undefined> {
  if (run.target.kind !== "source-directory") return undefined;

  const files = await walkSourceFiles(run.target.path);
  if (files.length === 0) {
    await emitActivity(emit, run.id, "info", "No source files discovered for prioritization.");
    return undefined;
  }

  await emitActivity(
    emit,
    run.id,
    "info",
    `Prioritizing ${pluralize(files.length, "source file")} for ${run.settings.scanCoverage} coverage.`,
  );
  await emitActivity(emit, run.id, "info", scannerStageMessage(run, "file-prioritization"));

  const candidatePaths = files.map((file) => file.relativePath);
  const runner = getScannerAgentRunner(selectScannerProvider(run, "file-prioritization"));
  const prioritizer = new StructuredFilePrioritizer(runner);
  const prioritization = await prioritizer.prioritize({
    run,
    threatModel,
    candidatePaths,
    artifactStore,
    emit,
  });
  throwIfCanceled(signal);

  await emit({ type: "filePrioritization.completed", runId: run.id, prioritization });
  await emitActivity(
    emit,
    run.id,
    "info",
    `Prioritized ${prioritization.prioritized.length} of ${pluralize(prioritization.totalFiles, "file")}.`,
  );
  return prioritization;
}

function prioritizationStageMessage(
  prioritization: FilePrioritization | undefined,
  coverage: ScanRun["settings"]["scanCoverage"],
): string {
  if (!prioritization) return "Skipped: no source files.";
  return `${prioritization.prioritized.length}/${prioritization.totalFiles} ranked (${coverage}).`;
}

async function aggregateFindings(
  run: ScanRun,
  threatModel: ThreatModel,
  analysisUnits: AnalysisUnit[],
  unitResults: AnalysisUnitResult[],
  candidateFindings: Finding[],
  emit: RunEventEmitter,
  artifactStore: FilesystemRunArtifactStore,
): Promise<Finding[]> {
  await emitActivity(
    emit,
    run.id,
    "info",
    `Aggregating ${pluralize(candidateFindings.length, "candidate finding")}.`,
  );
  await emitActivity(emit, run.id, "info", scannerStageMessage(run, "aggregation"));
  const runner = getScannerAgentRunner(selectScannerProvider(run, "aggregation"));
  return new StructuredFindingAggregator(runner).aggregateFindings({
    run,
    threatModel,
    analysisUnits,
    unitResults,
    candidateFindings,
    artifactStore,
    emit,
  });
}

async function runReportNarrationStage(
  run: ScanRun,
  findings: Finding[],
  validationResults: ValidationResult[],
  artifactStore: FilesystemRunArtifactStore,
  emit: RunEventEmitter,
  signal?: AbortSignal,
): Promise<Map<string, FindingNarrative>> {
  const narratives = new Map<string, FindingNarrative>();
  if (findings.length === 0 || run.target.kind !== "source-directory") return narratives;

  const runner = getScannerAgentRunner(selectScannerProvider(run, "report-narration"));
  const narrator = new StructuredFindingNarrator(runner);
  const resultsById = new Map(validationResults.map((r) => [r.findingId, r]));
  const concurrency = Math.max(1, Math.min(4, findings.length));

  await emitActivity(
    emit,
    run.id,
    "info",
    `Narrating ${pluralize(findings.length, "finding")} for the final report with ${runner.label}.`,
  );

  const entries = await mapConcurrent(findings, concurrency, async (finding) => {
    throwIfCanceled(signal);
    try {
      const narrative = await narrator.narrate({
        run,
        finding,
        validationResult: resultsById.get(finding.id),
        artifactStore,
        emit,
      });
      return [finding.id, narrative] as const;
    } catch (error) {
      // One bad narration shouldn't sink the whole report — fall back to the
      // deterministic prose for this finding.
      await emitActivity(
        emit,
        run.id,
        "warn",
        `Report narration for ${finding.title} failed: ${error instanceof Error ? error.message : String(error)}. Using deterministic fallback.`,
      );
      return null;
    }
  });

  for (const entry of entries) {
    if (entry) narratives.set(entry[0], entry[1]);
  }
  return narratives;
}

async function emitActivity(
  emit: RunEventEmitter,
  runId: string,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  await emit({
    type: "run.activity",
    runId,
    activity: {
      id: crypto.randomUUID(),
      level,
      message,
      createdAt: new Date().toISOString(),
    },
  });
}

async function startStage(
  emit: RunEventEmitter,
  runId: string,
  stageId: RunStageId,
  message: string,
): Promise<void> {
  await emitStage(emit, runId, stageId, "running", message, {
    startedAt: new Date().toISOString(),
  });
}

async function completeStage(
  emit: RunEventEmitter,
  runId: string,
  stageId: RunStageId,
  message: string,
  current?: number,
  total?: number,
): Promise<void> {
  await emitStage(emit, runId, stageId, "completed", message, {
    completedAt: new Date().toISOString(),
    ...(current === undefined ? {} : { current }),
    ...(total === undefined ? {} : { total }),
  });
}

async function emitStage(
  emit: RunEventEmitter,
  runId: string,
  stageId: RunStageId,
  status: RunStageStatus,
  message: string,
  patch: { startedAt?: string; completedAt?: string; current?: number; total?: number } = {},
): Promise<void> {
  await emit({
    type: "stage.changed",
    runId,
    stage: {
      id: stageId,
      label: stageLabels[stageId],
      status,
      message,
      ...patch,
    },
  });
}

function throwIfCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): Error {
  return new DOMException("Run canceled", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const stageLabels: Record<RunStageId, string> = {
  "threat-model": "Threat model",
  "file-prioritization": "File prioritization",
  "analysis-discovery": "Analysis discovery",
  "unit-scanning": "Unit scanning",
  "finding-aggregation": "Finding aggregation",
  validation: "Validation",
  reporting: "Reporting",
};
