import { Box, Text } from "ink";
import type { ValidatorEnvironment } from "../../domain";
import { Pane } from "../components/Pane";

interface ValidatorEnvironmentsScreenProps {
  environments: ValidatorEnvironment[];
  selectedIndex: number;
}

export function ValidatorEnvironmentsScreen({
  environments,
  selectedIndex,
}: ValidatorEnvironmentsScreenProps) {
  const selected = environments[selectedIndex];
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Environments" width={38}>
        {environments.length === 0 ? <Text color="gray">No environments yet</Text> : null}
        {environments.map((environment, index) =>
          index === selectedIndex ? (
            <Text key={environment.id} color="cyan">
              ▸ {environment.name} <Text color="gray">{environment.kind}</Text>
            </Text>
          ) : (
            <Text key={environment.id}>
              {" "}
              {environment.name} <Text color="gray">{environment.kind}</Text>
            </Text>
          ),
        )}
      </Pane>
      <Pane title="Environment Details" flexGrow={1}>
        {selected ? (
          <EnvironmentDetails environment={selected} />
        ) : (
          <Text color="gray">Create an environment before starting scans.</Text>
        )}
      </Pane>
    </Box>
  );
}

function EnvironmentDetails({ environment }: { environment: ValidatorEnvironment }) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">▣ {environment.name}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Status: <Text color="yellow">{environment.status}</Text>
        </Text>
        <Text>Kind: {environment.kind}</Text>
        {environment.kind === "browser" ? (
          <Text>App URL: {environment.browser?.appUrl}</Text>
        ) : null}
        {environment.kind === "browser" ? (
          <Text>Profile: {environment.browser?.profilePath}</Text>
        ) : null}
        {environment.kind === "ios-simulator" ? (
          <Text>App path: {environment.ios?.appPath || "not set"}</Text>
        ) : null}
        {environment.kind === "ios-simulator" ? (
          <Text>Bundle ID: {environment.ios?.bundleId || "not set"}</Text>
        ) : null}
      </Box>
      <Box marginTop={2} flexDirection="column">
        <Text color="gray">
          Environments are prepared browser or simulator states used during validation.
        </Text>
        <Text color="gray">Interactive setup and per-run cloning comes next.</Text>
      </Box>
    </Box>
  );
}
