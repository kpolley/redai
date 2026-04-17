import { Box, Text } from "ink";
import type React from "react";
import type { RunStatus, ScanRunState, ScanRunSummary, ValidatorEnvironment } from "../../domain";
import { displayPath, getRedaiRunDir } from "../../paths";
import { ListPreviewLayout } from "../components/ListPreviewLayout";

interface RunsScreenProps {
  runs: ScanRunSummary[];
  selectedIndex: number;
  selectedRun: ScanRunState | undefined;
  validatorEnvironments: ValidatorEnvironment[];
  viewportHeight: number;
}

export function RunsScreen({
  runs,
  selectedIndex,
  selectedRun,
  validatorEnvironments,
  viewportHeight,
}: RunsScreenProps) {
  return (
    <ListPreviewLayout
      listTitle="Scans"
      items={runs}
      selectedIndex={selectedIndex}
      listWidth={34}
      emptyListText="No scans yet"
      previewEmptyText="Select or create a scan."
      renderRow={(run, _index, selected) => <RunRow key={run.id} run={run} selected={selected} />}
      renderPreview={() =>
        selectedRun ? (
          <RunSummary
            state={selectedRun}
            validatorEnvironments={validatorEnvironments}
            viewportHeight={viewportHeight}
          />
        ) : (
          <Text color="gray">Select or create a scan.</Text>
        )
      }
      visibleRowCount={Math.max(6, viewportHeight - 8)}
    />
  );
}

function RunRow({ run, selected }: { run: ScanRunSummary; selected: boolean }) {
  const content = (
    <>
      {selected ? "▸" : " "}{" "}
      <Text color={runStatusColor(run.status)}>{runStatusIcon(run.status)}</Text> {run.name}{" "}
      <Text color={selected ? "yellow" : "gray"}>{run.findingCount}</Text>
    </>
  );
  return selected ? <Text color="cyan">{content}</Text> : <Text>{content}</Text>;
}

function RunSummary({
  state,
  validatorEnvironments,
  viewportHeight,
}: {
  state: ScanRunState;
  validatorEnvironments: ValidatorEnvironment[];
  viewportHeight: number;
}) {
  const showSecondarySections = viewportHeight >= 32;
  return (
    <>
      <Text color="cyan">▣ {state.run.name}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Status:{" "}
          <Text color={runStatusColor(state.run.status)}>
            {runStatusIcon(state.run.status)} {state.run.status}
          </Text>
        </Text>
        {state.run.status === "cancel-pending" ? (
          <Text color="yellow">
            Cancel requested; active agent work may finish before the run stops.
          </Text>
        ) : null}
        <Text>Target: {formatTarget(state.run.target)}</Text>
        <Text>
          Findings: {state.findings.length} candidate ·{" "}
          {state.validationResults.filter((result) => result.status === "confirmed").length}{" "}
          confirmed
        </Text>
        <Text>
          Analysis units: {state.analysisUnits.length} discovered ·{" "}
          {state.analysisUnitResults.length} analyzed
        </Text>
        <Text>
          Environment:{" "}
          {formatEnvironmentName(state.run.settings.validatorEnvironmentId, validatorEnvironments)}
        </Text>
        <Text>Scan coverage: {state.run.settings.scanCoverage}</Text>
        <Text>
          Scan agents: {state.run.settings.unitAgentConcurrency} · Validator agents:{" "}
          {state.run.settings.validatorAgentConcurrency}
        </Text>
        {state.run.status === "completed" ? (
          <Text wrap="truncate-middle">
            Report: {displayPath(`${getRedaiRunDir(state.run.id)}/report.html`)}
          </Text>
        ) : null}
      </Box>
      <Section title="Stages">
        {state.stages.length === 0 ? <Text color="gray">No stage activity yet.</Text> : null}
        {state.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </Section>
      {showSecondarySections ? (
        <>
          <Section title="Activity">
            {state.activity.length === 0 ? <Text color="gray">No activity yet.</Text> : null}
            {state.activity.slice(-6).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </Section>
          <Section title="Recent Findings">
            {state.findings.length === 0 ? (
              <Text color="gray">No findings discovered yet.</Text>
            ) : null}
            {[...state.findings]
              .reverse()
              .slice(0, 12)
              .map((finding) => (
                <Text key={finding.id}>
                  <Text color={severityColor(finding.severity)}>
                    {finding.severity.toUpperCase().padEnd(8)}
                  </Text>{" "}
                  {finding.title} <Text color="gray">{finding.validationStatus}</Text>
                </Text>
              ))}
          </Section>
        </>
      ) : null}
    </>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">── {title} ──</Text>
      {children}
    </Box>
  );
}

function formatEnvironmentName(
  environmentId: string,
  environments: ValidatorEnvironment[],
): string {
  return (
    environments.find((environment) => environment.id === environmentId)?.name ?? environmentId
  );
}

function StageRow({ stage }: { stage: ScanRunState["stages"][number] }) {
  const progress = formatStageProgress(stage);
  return (
    <Text>
      <Text color={stageColor(stage.status)}>{stageIcon(stage.status)}</Text>{" "}
      {stage.label.padEnd(20)}{" "}
      <Text color="gray">
        {stage.status}
        {progress}
      </Text>
      {stage.message ? <Text color="gray"> · {stage.message}</Text> : null}
    </Text>
  );
}

function formatStageProgress(stage: ScanRunState["stages"][number]): string {
  return stage.total
    ? ` ${stage.current ?? 0}/${stage.total}`
    : stage.current
      ? ` ${stage.current}`
      : "";
}

function stageIcon(status: string): string {
  if (status === "completed") return "✓";
  if (status === "running") return "●";
  if (status === "failed") return "✕";
  if (status === "canceled") return "◼";
  return "○";
}

function stageColor(status: string): "gray" | "green" | "yellow" | "red" {
  if (status === "completed") return "green";
  if (status === "running") return "yellow";
  if (status === "failed") return "red";
  return "gray";
}

function runStatusIcon(status: RunStatus): string {
  if (status === "completed") return "✓";
  if (status === "failed") return "✕";
  if (status === "canceled") return "◼";
  if (status === "cancel-pending") return "◌";
  if (["queued", "scanning", "planning-validation", "validating"].includes(status)) return "●";
  return "○";
}

function runStatusColor(status: RunStatus): "gray" | "green" | "yellow" | "red" | "cyan" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "canceled") return "gray";
  if (status === "cancel-pending") return "yellow";
  if (["queued", "scanning", "planning-validation", "validating"].includes(status)) return "yellow";
  return "cyan";
}

function formatTarget(target: ScanRunState["run"]["target"]): string {
  if (target.kind === "website") return target.url;
  return target.path;
}

function severityColor(severity: string): "gray" | "green" | "yellow" | "red" | "magenta" {
  if (severity === "critical") return "magenta";
  if (severity === "high") return "red";
  if (severity === "medium") return "yellow";
  if (severity === "low") return "green";
  return "gray";
}

function ActivityRow({ activity }: { activity: ScanRunState["activity"][number] }) {
  const message = `${formatTime(activity.createdAt)} ${activity.message}`;
  if (activity.level === "error") return <Text color="red">{message}</Text>;
  if (activity.level === "warn") return <Text color="yellow">{message}</Text>;
  return <Text>{message}</Text>;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
