import { Box, Text } from "ink";
import type { ScanRunState } from "../../domain";
import { displayPath, getRedaiRunDir } from "../../paths";
import { Pane } from "../components/Pane";

interface DeleteScanScreenProps {
  state: ScanRunState;
}

export function DeleteScanScreen({ state }: DeleteScanScreenProps) {
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Delete Scan" flexGrow={1}>
        <Text color="red">Delete this scan?</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            Name: <Text color="yellow">{state.run.name}</Text>
          </Text>
          <Text>Run ID: {state.run.id}</Text>
          <Text>Target: {formatTarget(state)}</Text>
          <Text>
            Findings: {state.findings.length} · Artifacts: {state.artifacts.length}
          </Text>
        </Box>
        <Box marginTop={2} flexDirection="column">
          <Text color="red">
            This permanently deletes the scan history and all files under{" "}
            {displayPath(getRedaiRunDir(state.run.id))}.
          </Text>
          <Text color="gray">Press Y to delete, or Esc/N to cancel.</Text>
        </Box>
      </Pane>
    </Box>
  );
}

function formatTarget(state: ScanRunState): string {
  if (state.run.target.kind === "website") return state.run.target.url;
  return state.run.target.path;
}
