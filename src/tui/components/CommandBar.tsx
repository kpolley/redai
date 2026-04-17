import { Box, Text } from "ink";

interface CommandBarProps {
  view:
    | "runs"
    | "run-detail"
    | "finding-detail"
    | "new-scan"
    | "delete-scan"
    | "environments"
    | "new-environment"
    | "environment-setup"
    | "artifact-preview";
  runDetailMode?: "overview" | "report" | "findings" | "units";
}

export function CommandBar({ view, runDetailMode = "findings" }: CommandBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} width="100%">
      <Box gap={2}>
        <Text bold color="red">
          RedAI
        </Text>
        <Text color="gray">{viewLabel(view)}</Text>
      </Box>
      <Box gap={1} flexGrow={1} justifyContent="flex-end">
        <Command keyName="↑↓" label="navigate" />
        {enterCommand(view, runDetailMode)}
        {view === "runs" ? <Command keyName="N" label="new scan" /> : null}
        {view === "runs" ? <Command keyName="C" label="cancel" /> : null}
        {view === "runs" ? <Command keyName="R" label="resume" /> : null}
        {view === "runs" ? <Command keyName="D" label="delete" /> : null}
        {view === "delete-scan" ? <Command keyName="Y" label="delete forever" /> : null}
        {view === "delete-scan" ? <Command keyName="N" label="cancel" /> : null}
        {view === "new-scan" ? <Command keyName="↑↓" label="field" /> : null}
        {view === "environments" ? <Command keyName="N" label="new environment" /> : null}
        {view === "environments" ? <Command keyName="S" label="setup" /> : null}
        {view === "environments" ? <Command keyName="D" label="delete" /> : null}
        {view === "runs" || view === "environments" ? (
          <Command keyName="←→/Tab" label="switch tab" />
        ) : null}
        {view === "new-environment" ? <Command keyName="↑↓" label="field" /> : null}
        {view === "new-environment" ? <Command keyName="←→/Tab" label="kind" /> : null}
        {view === "environment-setup" ? <Command keyName="R" label="mark ready" /> : null}
        {view === "environment-setup" ? <Command keyName="O" label="reopen" /> : null}
        {view === "new-scan" ? <Command keyName="←→/Tab" label="environment" /> : null}
        {view === "run-detail" ? (
          <Command keyName="←→/Tab" label={nextRunDetailLabel(runDetailMode)} />
        ) : null}
        {view === "run-detail" && runDetailMode === "overview" ? (
          <Command keyName="PgUp/PgDn" label="scroll" />
        ) : null}
        {view === "run-detail" && runDetailMode === "report" ? (
          <Command keyName="PgUp/PgDn" label="scroll" />
        ) : null}
        {view === "run-detail" && runDetailMode === "findings" ? (
          <Command keyName="Enter" label="finding details" />
        ) : null}
        {view === "finding-detail" ? <Command keyName="←→/Tab" label="sections" /> : null}
        {view === "finding-detail" ? <Command keyName="PgUp/PgDn" label="scroll" /> : null}
        {view === "artifact-preview" ? <Command keyName="PgUp/PgDn" label="scroll" /> : null}
        {view !== "runs" ? <Command keyName="Esc" label="back" /> : null}
        <Command keyName="q" label="quit" />
      </Box>
    </Box>
  );
}

function enterCommand(
  view: CommandBarProps["view"],
  runDetailMode: NonNullable<CommandBarProps["runDetailMode"]>,
) {
  if (view === "runs") return <Command keyName="Enter" label="open" />;
  if (view === "new-scan") return <Command keyName="Enter" label="start" />;
  if (view === "new-environment") return <Command keyName="Enter" label="create" />;
  if (view === "run-detail" && runDetailMode === "findings")
    return <Command keyName="Enter" label="finding details" />;
  return null;
}

function Command({ keyName, label }: { keyName: string; label: string }) {
  return (
    <Text>
      <Text color="cyan">{keyName}</Text>
      <Text color="gray"> {label}</Text>
    </Text>
  );
}

function viewLabel(view: CommandBarProps["view"]): string {
  if (view === "run-detail") return "run details";
  if (view === "finding-detail") return "finding details";
  if (view === "new-scan") return "new scan";
  if (view === "delete-scan") return "delete scan";
  if (view === "environments") return "environments";
  if (view === "new-environment") return "new environment";
  if (view === "environment-setup") return "environment setup";
  if (view === "artifact-preview") return "artifact preview";
  return "scans";
}

function nextRunDetailLabel(mode: NonNullable<CommandBarProps["runDetailMode"]>): string {
  if (mode === "overview") return "report";
  if (mode === "report") return "findings";
  if (mode === "findings") return "units";
  return "overview";
}
