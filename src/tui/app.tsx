import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import type { Artifact, ScanRunState, ValidatorEnvironment } from "../domain";
import { getRedaiRunDir } from "../paths";
import { CommandBar } from "./components/CommandBar";
import { TabBar } from "./components/TabBar";
import { ArtifactPreviewScreen } from "./screens/ArtifactPreviewScreen";
import { DeleteScanScreen } from "./screens/DeleteScanScreen";
import { EnvironmentSetupScreen } from "./screens/EnvironmentSetupScreen";
import {
  FindingDetailScreen,
  findingDetailPageSize,
  maxFindingDetailScrollOffset,
} from "./screens/FindingDetailScreen";
import {
  type NewEnvironmentField,
  type NewEnvironmentFormState,
  NewEnvironmentScreen,
} from "./screens/NewEnvironmentScreen";
import {
  type NewScanField,
  type NewScanFormState,
  type NewScanScanCoverage,
  type NewScanScannerProvider,
  NewScanScreen,
} from "./screens/NewScanScreen";
import { type FindingDetailMode, RunDetailScreen } from "./screens/RunDetailScreen";
import {
  maxOverviewScrollOffset,
  overviewPageSize,
  RunOverviewScreen,
} from "./screens/RunOverviewScreen";
import { maxReportScrollOffset, RunReportScreen, reportPageSize } from "./screens/RunReportScreen";
import { RunsScreen } from "./screens/RunsScreen";
import { RunUnitsScreen } from "./screens/RunUnitsScreen";
import { ValidatorEnvironmentsScreen } from "./screens/ValidatorEnvironmentsScreen";
import { useRedaiRuntime } from "./state/use-redai-runtime";

type View =
  | "runs"
  | "run-detail"
  | "finding-detail"
  | "new-scan"
  | "delete-scan"
  | "environments"
  | "new-environment"
  | "environment-setup"
  | "artifact-preview";
type RunDetailMode = "overview" | "report" | "findings" | "units";
type TopLevelTab = "runs" | "environments";

const runDetailTabs = [
  { id: "overview", label: "Overview" },
  { id: "report", label: "Report" },
  { id: "findings", label: "Findings" },
  { id: "units", label: "Units" },
] satisfies { id: RunDetailMode; label: string }[];

const findingDetailTabs = [
  { id: "details", label: "Details" },
  { id: "validation", label: "Validation" },
] satisfies { id: FindingDetailMode; label: string }[];

const findingDetailModes = findingDetailTabs.map((tab) => tab.id);

const topLevelTabs = [
  { id: "runs", label: "Scans" },
  { id: "environments", label: "Environments" },
] satisfies { id: TopLevelTab; label: string }[];

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [view, setView] = useState<View>("runs");
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>("runs");
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [selectedFindingIndex, setSelectedFindingIndex] = useState(0);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);
  const [findingDetailMode, setFindingDetailMode] = useState<FindingDetailMode>("details");
  const [findingDetailScrollOffset, setFindingDetailScrollOffset] = useState(0);
  const [overviewScrollOffset, setOverviewScrollOffset] = useState(0);
  const [reportScrollOffset, setReportScrollOffset] = useState(0);
  const [reportContent, setReportContent] = useState<
    { runId: string; content: string } | undefined
  >();
  const [reportLoadError, setReportLoadError] = useState<string | undefined>();
  const [selectedEnvironmentIndex, setSelectedEnvironmentIndex] = useState(0);
  const [setupEnvironmentId, setSetupEnvironmentId] = useState<string | undefined>();
  const [artifactPreview, setArtifactPreview] = useState<
    { artifactIndex: number; content: string; scrollOffset: number } | undefined
  >();
  const [quitWarning, setQuitWarning] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | undefined>();
  const [runDetailMode, setRunDetailMode] = useState<RunDetailMode>("findings");
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [terminalSize, setTerminalSize] = useState(() => ({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  }));
  const [newScanField, setNewScanField] = useState<NewScanField>("name");
  const [newScanForm, setNewScanForm] = useState<NewScanFormState>({
    name: "",
    sourceDirectory: process.cwd(),
    validatorEnvironmentId: "",
    scannerProvider: "claude",
    scanCoverage: "balanced",
    unitAgentConcurrency: 4,
    validatorAgentConcurrency: 2,
  });
  const [newEnvironmentField, setNewEnvironmentField] = useState<NewEnvironmentField>("name");
  const [newEnvironmentForm, setNewEnvironmentForm] = useState<NewEnvironmentFormState>({
    name: "",
    kind: "browser",
    appUrl: "http://localhost:3000",
    iosAppPath: "",
    iosBundleId: "",
  });
  const { runtime, runs, validatorEnvironments, selectedRun } = useRedaiRuntime(selectedRunId);
  const readyValidatorEnvironments = validatorEnvironments.filter(
    (environment) => environment.status === "ready",
  );
  const height = terminalSize.rows;
  const tabBarCount = visibleTabBarCount(view);
  const warningRows = quitWarning ? 1 : 0;
  const errorRows = errorBanner ? 1 : 0;
  const contentHeight = Math.max(1, height - 3 - warningRows - errorRows - tabBarCount);

  function runAsync<T>(label: string, fn: () => Promise<T>, onSuccess?: (value: T) => void): void {
    void (async () => {
      try {
        const value = await fn();
        onSuccess?.(value);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorBanner(`${label}: ${message}`);
      }
    })();
  }

  useEffect(() => {
    const updateTerminalSize = () =>
      setTerminalSize({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
    updateTerminalSize();
    stdout.on?.("resize", updateTerminalSize);
    return () => {
      stdout.off?.("resize", updateTerminalSize);
    };
  }, [stdout]);

  useEffect(() => {
    const nextRunId = runs[selectedRunIndex]?.id;
    setSelectedRunId(nextRunId);
  }, [runs, selectedRunIndex]);

  // Lazily load report.md the first time the user opens the Report tab for a
  // completed run. Re-load if the user switches runs or if a run that wasn't
  // complete becomes complete while the tab is open.
  useEffect(() => {
    if (view !== "run-detail" || runDetailMode !== "report") return;
    if (!selectedRun || selectedRun.run.status !== "completed") return;
    if (reportContent?.runId === selectedRun.run.id) return;
    const runId = selectedRun.run.id;
    const reportPath = join(getRedaiRunDir(runId), "report.md");
    setReportLoadError(undefined);
    void readFile(reportPath, "utf8").then(
      (content) => {
        setReportContent({ runId, content });
        setReportScrollOffset(0);
      },
      (err) => {
        setReportLoadError(err instanceof Error ? err.message : String(err));
      },
    );
  }, [view, runDetailMode, selectedRun, reportContent?.runId]);

  useInput((input, key) => {
    if (errorBanner) setErrorBanner(undefined);
    if (input === "q" || (key.ctrl && input === "c")) {
      if (hasActiveRuns(runs) && !quitWarning) {
        setQuitWarning(true);
        return;
      }
      for (const run of runs.filter((run) => isCancelable(run.status))) {
        runAsync(`Cancel ${run.name}`, () => runtime.cancelRun(run.id));
      }
      exit();
    }

    if (quitWarning) setQuitWarning(false);

    if (view === "runs") {
      if (key.tab || key.rightArrow) {
        setTopLevelTab("environments");
        setView("environments");
        return;
      }
      if (key.upArrow) setSelectedRunIndex((index) => Math.max(0, index - 1));
      if (key.downArrow) setSelectedRunIndex((index) => Math.min(runs.length - 1, index + 1));
      if (input.toLowerCase() === "c" && selectedRun && isCancelable(selectedRun.run.status)) {
        runAsync("Cancel scan", () => runtime.cancelRun(selectedRun.run.id));
      }
      if (input.toLowerCase() === "r" && selectedRun && isResumable(selectedRun.run.status)) {
        runAsync(
          "Resume scan",
          () => runtime.resumeRun(selectedRun.run.id),
          (run) => {
            if (run) setSelectedRunId(run.id);
          },
        );
      }
      if (input.toLowerCase() === "d" && selectedRun) {
        setView("delete-scan");
      }
      if (input.toLowerCase() === "n") {
        setNewScanForm((form) => ({
          ...form,
          name: "",
          sourceDirectory: process.cwd(),
          validatorEnvironmentId: readyValidatorEnvironments[0]?.id ?? "",
        }));
        setNewScanField("name");
        setView("new-scan");
      }
      if (key.return && selectedRun) {
        setSelectedFindingIndex(0);
        setSelectedUnitIndex(0);
        setFindingDetailMode("details");
        setRunDetailMode("overview");
        setOverviewScrollOffset(0);
        setView("run-detail");
      }
    } else if (view === "run-detail") {
      if (key.escape) setView("runs");
      if (key.tab || key.rightArrow) {
        setRunDetailMode((mode) => nextRunDetailMode(mode));
        return;
      }
      if (key.leftArrow) {
        setRunDetailMode((mode) => previousRunDetailMode(mode));
        return;
      }
      if (runDetailMode === "overview") {
        if (key.upArrow) setOverviewScrollOffset((offset) => Math.max(0, offset - 1));
        if (key.downArrow && selectedRun)
          setOverviewScrollOffset((offset) =>
            Math.min(
              maxOverviewScrollOffset(selectedRun, validatorEnvironments, height),
              offset + 1,
            ),
          );
        if (key.pageUp)
          setOverviewScrollOffset((offset) => Math.max(0, offset - overviewPageSize(height)));
        if (key.pageDown && selectedRun)
          setOverviewScrollOffset((offset) =>
            Math.min(
              maxOverviewScrollOffset(selectedRun, validatorEnvironments, height),
              offset + overviewPageSize(height),
            ),
          );
      } else if (runDetailMode === "report") {
        const reportText =
          reportContent && selectedRun && reportContent.runId === selectedRun.run.id
            ? reportContent.content
            : undefined;
        if (key.upArrow) setReportScrollOffset((offset) => Math.max(0, offset - 1));
        if (key.downArrow)
          setReportScrollOffset((offset) =>
            Math.min(maxReportScrollOffset(reportText, height), offset + 1),
          );
        if (key.pageUp)
          setReportScrollOffset((offset) => Math.max(0, offset - reportPageSize(height)));
        if (key.pageDown)
          setReportScrollOffset((offset) =>
            Math.min(maxReportScrollOffset(reportText, height), offset + reportPageSize(height)),
          );
      } else if (runDetailMode === "findings") {
        if (key.upArrow) setSelectedFindingIndex((index) => Math.max(0, index - 1));
        if (key.downArrow && selectedRun)
          setSelectedFindingIndex((index) => Math.min(selectedRun.findings.length - 1, index + 1));
        if (key.return && selectedRun?.findings.length) {
          setSelectedUnitIndex(0);
          setFindingDetailMode("details");
          setFindingDetailScrollOffset(0);
          setView("finding-detail");
        }
      } else if (runDetailMode === "units") {
        if (key.upArrow) setSelectedUnitIndex((index) => Math.max(0, index - 1));
        if (key.downArrow && selectedRun)
          setSelectedUnitIndex((index) =>
            Math.min(selectedRun.analysisUnits.length - 1, index + 1),
          );
      }
    } else if (view === "finding-detail") {
      if (key.escape) setView("run-detail");
      if (key.upArrow) setFindingDetailScrollOffset((offset) => Math.max(0, offset - 1));
      if (key.downArrow && selectedRun)
        setFindingDetailScrollOffset((offset) =>
          Math.min(
            maxFindingDetailScrollOffset(
              selectedRun,
              selectedFindingIndex,
              findingDetailMode,
              height,
            ),
            offset + 1,
          ),
        );
      if (key.pageUp)
        setFindingDetailScrollOffset((offset) =>
          Math.max(0, offset - findingDetailPageSize(height)),
        );
      if (key.pageDown && selectedRun)
        setFindingDetailScrollOffset((offset) =>
          Math.min(
            maxFindingDetailScrollOffset(
              selectedRun,
              selectedFindingIndex,
              findingDetailMode,
              height,
            ),
            offset + findingDetailPageSize(height),
          ),
        );
      if (key.leftArrow) {
        setFindingDetailMode((mode) => previousFindingDetailMode(mode));
        setFindingDetailScrollOffset(0);
        return;
      }
      if (key.rightArrow || key.tab) {
        setFindingDetailMode((mode) => nextFindingDetailMode(mode));
        setFindingDetailScrollOffset(0);
        return;
      }
    } else if (view === "artifact-preview") {
      if (key.escape) setView("run-detail");
      if (key.upArrow)
        setArtifactPreview((preview) =>
          preview ? { ...preview, scrollOffset: Math.max(0, preview.scrollOffset - 1) } : preview,
        );
      if (key.downArrow)
        setArtifactPreview((preview) =>
          preview
            ? {
                ...preview,
                scrollOffset: Math.min(
                  maxArtifactScrollOffset(preview.content, height),
                  preview.scrollOffset + 1,
                ),
              }
            : preview,
        );
      if (key.pageUp)
        setArtifactPreview((preview) =>
          preview
            ? {
                ...preview,
                scrollOffset: Math.max(0, preview.scrollOffset - artifactPageSize(height)),
              }
            : preview,
        );
      if (key.pageDown)
        setArtifactPreview((preview) =>
          preview
            ? {
                ...preview,
                scrollOffset: Math.min(
                  maxArtifactScrollOffset(preview.content, height),
                  preview.scrollOffset + artifactPageSize(height),
                ),
              }
            : preview,
        );
    } else if (view === "delete-scan") {
      if (key.escape || input.toLowerCase() === "n") setView("runs");
      if (input.toLowerCase() === "y" && selectedRun) {
        const deletedIndex = selectedRunIndex;
        runAsync(
          "Delete scan",
          () => runtime.deleteRun(selectedRun.run.id),
          () => {
            setSelectedRunIndex((index) =>
              Math.max(0, Math.min(deletedIndex, runs.length - 2, index)),
            );
            setSelectedRunId(undefined);
            setView("runs");
          },
        );
      }
    } else if (view === "environments") {
      if (key.tab || key.leftArrow) {
        setTopLevelTab("runs");
        setView("runs");
        return;
      }
      if (key.escape) setView("runs");
      if (key.upArrow) setSelectedEnvironmentIndex((index) => Math.max(0, index - 1));
      if (key.downArrow)
        setSelectedEnvironmentIndex((index) =>
          Math.min(validatorEnvironments.length - 1, index + 1),
        );
      if (input.toLowerCase() === "n") {
        setNewEnvironmentForm((form) => ({ ...form, name: "" }));
        setNewEnvironmentField("name");
        setView("new-environment");
      }
      if (input.toLowerCase() === "d") {
        const environment = validatorEnvironments[selectedEnvironmentIndex];
        if (environment)
          runAsync(
            "Delete environment",
            () => runtime.deleteValidatorEnvironment(environment.id),
            () => setSelectedEnvironmentIndex(0),
          );
      }
      if (input.toLowerCase() === "s") {
        const environment = validatorEnvironments[selectedEnvironmentIndex];
        if (environment) {
          setSetupEnvironmentId(environment.id);
          setView("environment-setup");
          runAsync("Start environment setup", () =>
            runtime.startValidatorEnvironmentSetup(environment.id),
          );
        }
      }
    } else if (view === "environment-setup") {
      if (key.escape) setView("environments");
      if (input.toLowerCase() === "o" && setupEnvironmentId)
        runAsync("Open environment setup", () =>
          runtime.startValidatorEnvironmentSetup(setupEnvironmentId),
        );
      if (input.toLowerCase() === "r" && setupEnvironmentId) {
        runAsync(
          "Mark environment ready",
          () => runtime.markValidatorEnvironmentReady(setupEnvironmentId),
          () => setView("environments"),
        );
      }
    } else if (view === "new-environment") {
      if (key.escape) setView("environments");
      if (key.upArrow) {
        setNewEnvironmentField((field) => previousEnvironmentField(field));
        return;
      }
      if (key.downArrow) {
        setNewEnvironmentField((field) => nextEnvironmentField(field));
        return;
      }
      if (key.tab || key.leftArrow || key.rightArrow) {
        setNewEnvironmentForm((form) => adjustEnvironmentField(form, newEnvironmentField));
        return;
      }
      if (key.backspace || key.delete) {
        setNewEnvironmentForm((form) => deleteFromEnvironmentField(form, newEnvironmentField));
        return;
      }
      if (key.return) {
        if (!newEnvironmentForm.name.trim()) {
          setNewEnvironmentField("name");
          return;
        }
        runAsync(
          "Create environment",
          () =>
            runtime.createValidatorEnvironment({
              name: newEnvironmentForm.name.trim(),
              kind: newEnvironmentForm.kind,
              ...(newEnvironmentForm.kind === "browser"
                ? { browser: { appUrl: newEnvironmentForm.appUrl, profilePath: "" } }
                : {}),
              ...(newEnvironmentForm.kind === "ios-simulator"
                ? {
                    ios: {
                      appPath: newEnvironmentForm.iosAppPath,
                      bundleId: newEnvironmentForm.iosBundleId,
                    },
                  }
                : {}),
            }),
          (environment) => {
            setNewScanForm((form) => ({ ...form, validatorEnvironmentId: environment.id }));
            setSetupEnvironmentId(environment.id);
            setView("environment-setup");
            runAsync("Start environment setup", () =>
              runtime.startValidatorEnvironmentSetup(environment.id),
            );
          },
        );
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNewEnvironmentForm((form) => appendToEnvironmentField(form, newEnvironmentField, input));
      }
    } else if (view === "new-scan") {
      if (key.escape) setView("runs");
      if (key.upArrow) {
        setNewScanField((field) => previousField(field));
        return;
      }
      if (key.downArrow) {
        setNewScanField((field) => nextField(field));
        return;
      }
      if (key.tab || key.leftArrow || key.rightArrow) {
        setNewScanForm((form) =>
          adjustActiveField(form, newScanField, key.leftArrow ? -1 : 1, readyValidatorEnvironments),
        );
        return;
      }
      if (key.backspace || key.delete) {
        setNewScanForm((form) => deleteFromActiveField(form, newScanField));
        return;
      }
      if (key.return) {
        const name = newScanForm.name.trim();
        if (!name) {
          setNewScanField("name");
          return;
        }
        if (!newScanForm.validatorEnvironmentId) {
          setNewScanField("validatorEnvironment");
          return;
        }
        const target = {
          kind: "source-directory" as const,
          path: newScanForm.sourceDirectory || process.cwd(),
        };
        const settings = {
          validatorEnvironmentId: newScanForm.validatorEnvironmentId,
          scannerProvider: newScanForm.scannerProvider,
          scanCoverage: newScanForm.scanCoverage,
          unitAgentConcurrency: newScanForm.unitAgentConcurrency,
          validatorAgentConcurrency: newScanForm.validatorAgentConcurrency,
        };
        runAsync(
          "Create scan",
          () => runtime.createRun({ name, target, settings }),
          (run) => {
            setSelectedRunId(run.id);
            setSelectedRunIndex(0);
            setView("runs");
            runAsync("Start scan", () => runtime.startRun(run.id));
          },
        );
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNewScanForm((form) => appendToActiveField(form, newScanField, input));
      }
    }
  });

  return (
    <Box flexDirection="column" height={height}>
      <Box flexShrink={0} width="100%">
        <CommandBar view={view} runDetailMode={runDetailMode} />
      </Box>
      {quitWarning ? (
        <Box paddingX={1} flexShrink={0}>
          <Text color="yellow">A scan is still running. Press q again to quit anyway.</Text>
        </Box>
      ) : null}
      {errorBanner ? (
        <Box paddingX={1} flexShrink={0}>
          <Text color="red">{errorBanner}</Text>
        </Box>
      ) : null}
      {view === "runs" || view === "environments" ? (
        <Box flexShrink={0}>
          <TabBar tabs={topLevelTabs} activeTab={topLevelTab} />
        </Box>
      ) : null}
      {view === "run-detail" ? (
        <Box flexShrink={0}>
          <TabBar tabs={runDetailTabs} activeTab={runDetailMode} />
        </Box>
      ) : null}
      {view === "finding-detail" ? (
        <Box flexShrink={0}>
          <TabBar tabs={findingDetailTabs} activeTab={findingDetailMode} />
        </Box>
      ) : null}
      <Box height={contentHeight} minHeight={0}>
        {view === "runs" ? (
          <RunsScreen
            runs={runs}
            selectedIndex={selectedRunIndex}
            selectedRun={selectedRun}
            validatorEnvironments={validatorEnvironments}
            viewportHeight={contentHeight}
          />
        ) : null}
        {view === "environments" ? (
          <ValidatorEnvironmentsScreen
            environments={validatorEnvironments}
            selectedIndex={selectedEnvironmentIndex}
          />
        ) : null}
        {view === "new-environment" ? (
          <NewEnvironmentScreen form={newEnvironmentForm} activeField={newEnvironmentField} />
        ) : null}
        {view === "environment-setup" ? (
          <EnvironmentSetupScreen
            environment={validatorEnvironments.find(
              (environment) => environment.id === setupEnvironmentId,
            )}
          />
        ) : null}
        {view === "delete-scan" && selectedRun ? <DeleteScanScreen state={selectedRun} /> : null}
        {view === "run-detail" && selectedRun && runDetailMode === "overview" ? (
          <RunOverviewScreen
            state={selectedRun}
            validatorEnvironments={validatorEnvironments}
            scrollOffset={overviewScrollOffset}
            viewportHeight={contentHeight}
          />
        ) : null}
        {view === "run-detail" && selectedRun && runDetailMode === "report" ? (
          <RunReportScreen
            state={selectedRun}
            content={
              reportContent && reportContent.runId === selectedRun.run.id
                ? reportContent.content
                : undefined
            }
            loadError={reportLoadError}
            scrollOffset={reportScrollOffset}
            viewportHeight={contentHeight}
          />
        ) : null}
        {view === "run-detail" && selectedRun && runDetailMode === "findings" ? (
          <RunDetailScreen state={selectedRun} selectedFindingIndex={selectedFindingIndex} />
        ) : null}
        {view === "run-detail" && selectedRun && runDetailMode === "units" ? (
          <RunUnitsScreen state={selectedRun} selectedUnitIndex={selectedUnitIndex} />
        ) : null}
        {view === "finding-detail" && selectedRun ? (
          <FindingDetailScreen
            state={selectedRun}
            selectedFindingIndex={selectedFindingIndex}
            findingDetailMode={findingDetailMode}
            scrollOffset={findingDetailScrollOffset}
            viewportHeight={contentHeight}
          />
        ) : null}
        {view === "artifact-preview" && selectedRun && artifactPreview ? (
          <SelectedArtifactPreview state={selectedRun} preview={artifactPreview} height={height} />
        ) : null}
        {view === "new-scan" ? (
          <NewScanScreen
            form={newScanForm}
            activeField={newScanField}
            environments={readyValidatorEnvironments}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function visibleTabBarCount(view: View): number {
  if (view === "runs" || view === "environments") return 1;
  if (view === "run-detail") return 1;
  if (view === "finding-detail") return 1;
  return 0;
}

function SelectedArtifactPreview({
  state,
  preview,
  height,
}: {
  state: ScanRunState;
  preview: { artifactIndex: number; content: string; scrollOffset: number };
  height: number;
}) {
  const artifact: Artifact | undefined = state.artifacts[preview.artifactIndex];
  if (!artifact) return null;
  return (
    <ArtifactPreviewScreen
      runId={state.run.id}
      artifact={artifact}
      content={preview.content}
      scrollOffset={preview.scrollOffset}
      viewportHeight={height}
    />
  );
}

function artifactPageSize(height: number): number {
  return Math.max(1, height - 10);
}

function maxArtifactScrollOffset(content: string, height: number): number {
  const lineCount = content.split(/\r?\n/).length;
  return Math.max(0, lineCount - artifactPageSize(height));
}

const newScanFields: NewScanField[] = [
  "name",
  "sourceDirectory",
  "validatorEnvironment",
  "scannerProvider",
  "scanCoverage",
  "unitAgentConcurrency",
  "validatorAgentConcurrency",
];

function nextField(field: NewScanField): NewScanField {
  const index = newScanFields.indexOf(field);
  return newScanFields[Math.min(newScanFields.length - 1, index + 1)] ?? field;
}

function previousField(field: NewScanField): NewScanField {
  const index = newScanFields.indexOf(field);
  return newScanFields[Math.max(0, index - 1)] ?? field;
}

function appendToActiveField(
  form: NewScanFormState,
  field: NewScanField,
  input: string,
): NewScanFormState {
  if (field === "name") return { ...form, name: `${form.name}${input}` };
  if (field === "sourceDirectory")
    return { ...form, sourceDirectory: `${form.sourceDirectory}${input}` };
  return form;
}

function deleteFromActiveField(form: NewScanFormState, field: NewScanField): NewScanFormState {
  if (field === "name") return { ...form, name: form.name.slice(0, -1) };
  if (field === "sourceDirectory")
    return { ...form, sourceDirectory: form.sourceDirectory.slice(0, -1) };
  return form;
}

function adjustActiveField(
  form: NewScanFormState,
  field: NewScanField,
  direction: -1 | 1,
  environments: ValidatorEnvironment[],
): NewScanFormState {
  if (field === "validatorEnvironment")
    return {
      ...form,
      validatorEnvironmentId: nextValidatorEnvironmentId(
        form.validatorEnvironmentId,
        direction,
        environments,
      ),
    };
  if (field === "scannerProvider")
    return { ...form, scannerProvider: nextScannerProvider(form.scannerProvider, direction) };
  if (field === "scanCoverage")
    return { ...form, scanCoverage: nextScanCoverage(form.scanCoverage, direction) };
  if (field === "unitAgentConcurrency") {
    return {
      ...form,
      unitAgentConcurrency: Math.max(1, form.unitAgentConcurrency + direction),
    };
  }
  if (field === "validatorAgentConcurrency") {
    return {
      ...form,
      validatorAgentConcurrency: Math.max(1, form.validatorAgentConcurrency + direction),
    };
  }
  return form;
}

function nextValidatorEnvironmentId(
  currentId: string,
  direction: -1 | 1,
  environments: ValidatorEnvironment[],
): string {
  if (environments.length === 0) return "";
  const currentIndex = Math.max(
    0,
    environments.findIndex((environment) => environment.id === currentId),
  );
  const nextIndex = (currentIndex + direction + environments.length) % environments.length;
  return environments[nextIndex]?.id ?? environments[0]?.id ?? "";
}

const scannerProviders: NewScanScannerProvider[] = ["claude", "codex"];

function nextScannerProvider(
  provider: NewScanScannerProvider,
  direction: -1 | 1,
): NewScanScannerProvider {
  const currentIndex = scannerProviders.indexOf(provider);
  const nextIndex = (currentIndex + direction + scannerProviders.length) % scannerProviders.length;
  return scannerProviders[nextIndex] ?? provider;
}

const scanCoverages: NewScanScanCoverage[] = ["focused", "balanced", "thorough"];

function nextScanCoverage(coverage: NewScanScanCoverage, direction: -1 | 1): NewScanScanCoverage {
  const currentIndex = scanCoverages.indexOf(coverage);
  const nextIndex = (currentIndex + direction + scanCoverages.length) % scanCoverages.length;
  return scanCoverages[nextIndex] ?? coverage;
}

function nextRunDetailMode(mode: RunDetailMode): RunDetailMode {
  if (mode === "overview") return "report";
  if (mode === "report") return "findings";
  if (mode === "findings") return "units";
  return "overview";
}

function previousRunDetailMode(mode: RunDetailMode): RunDetailMode {
  if (mode === "report") return "overview";
  if (mode === "findings") return "report";
  if (mode === "units") return "findings";
  return "units";
}

function nextFindingDetailMode(mode: FindingDetailMode): FindingDetailMode {
  const index = findingDetailModes.indexOf(mode);
  return findingDetailModes[(index + 1) % findingDetailModes.length] ?? mode;
}

function previousFindingDetailMode(mode: FindingDetailMode): FindingDetailMode {
  const index = findingDetailModes.indexOf(mode);
  return (
    findingDetailModes[(index - 1 + findingDetailModes.length) % findingDetailModes.length] ?? mode
  );
}

function _stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isCancelable(status: string): boolean {
  return ["queued", "scanning", "planning-validation", "validating"].includes(status);
}

function isResumable(status: string): boolean {
  return ["completed", "failed", "canceled"].includes(status);
}

function hasActiveRuns(runs: { status: string }[]): boolean {
  return runs.some((run) => isCancelable(run.status));
}

const environmentFields: NewEnvironmentField[] = [
  "name",
  "kind",
  "appUrl",
  "iosAppPath",
  "iosBundleId",
];

function nextEnvironmentField(field: NewEnvironmentField): NewEnvironmentField {
  const index = environmentFields.indexOf(field);
  return environmentFields[Math.min(environmentFields.length - 1, index + 1)] ?? field;
}

function previousEnvironmentField(field: NewEnvironmentField): NewEnvironmentField {
  const index = environmentFields.indexOf(field);
  return environmentFields[Math.max(0, index - 1)] ?? field;
}

function adjustEnvironmentField(
  form: NewEnvironmentFormState,
  field: NewEnvironmentField,
): NewEnvironmentFormState {
  if (field === "kind")
    return { ...form, kind: form.kind === "browser" ? "ios-simulator" : "browser" };
  return form;
}

function appendToEnvironmentField(
  form: NewEnvironmentFormState,
  field: NewEnvironmentField,
  input: string,
): NewEnvironmentFormState {
  if (field === "name") return { ...form, name: `${form.name}${input}` };
  if (field === "appUrl") return { ...form, appUrl: `${form.appUrl}${input}` };
  if (field === "iosAppPath") return { ...form, iosAppPath: `${form.iosAppPath}${input}` };
  if (field === "iosBundleId") return { ...form, iosBundleId: `${form.iosBundleId}${input}` };
  return form;
}

function deleteFromEnvironmentField(
  form: NewEnvironmentFormState,
  field: NewEnvironmentField,
): NewEnvironmentFormState {
  if (field === "name") return { ...form, name: form.name.slice(0, -1) };
  if (field === "appUrl") return { ...form, appUrl: form.appUrl.slice(0, -1) };
  if (field === "iosAppPath") return { ...form, iosAppPath: form.iosAppPath.slice(0, -1) };
  if (field === "iosBundleId") return { ...form, iosBundleId: form.iosBundleId.slice(0, -1) };
  return form;
}
