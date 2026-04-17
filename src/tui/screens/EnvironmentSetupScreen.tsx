import { Box, Text } from "ink";
import type { ValidatorEnvironment } from "../../domain";
import { Pane } from "../components/Pane";

interface EnvironmentSetupScreenProps {
  environment: ValidatorEnvironment | undefined;
}

export function EnvironmentSetupScreen({ environment }: EnvironmentSetupScreenProps) {
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Environment Setup" flexGrow={1}>
        {environment ? (
          <SetupDetails environment={environment} />
        ) : (
          <Text color="gray">No environment selected.</Text>
        )}
      </Pane>
    </Box>
  );
}

function SetupDetails({ environment }: { environment: ValidatorEnvironment }) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Set up: {environment.name}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Kind: {environment.kind}</Text>
        <Text>
          Status: <Text color="yellow">{environment.status}</Text>
        </Text>
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
        {environment.kind === "ios-simulator" ? (
          <Text>
            Template simulator:{" "}
            {environment.ios?.templateDeviceUdid || environment.ios?.deviceName || "booted"}
          </Text>
        ) : null}
      </Box>
      <Box marginTop={2} flexDirection="column">
        <Text color="yellow">
          A setup {environment.kind === "browser" ? "browser" : "simulator app"} should be open. Log
          in and prepare the app state there.
        </Text>
        <Text color="gray">
          Press R when ready. Press O to reopen setup. Press Esc to leave it in setup state.
        </Text>
      </Box>
    </Box>
  );
}
