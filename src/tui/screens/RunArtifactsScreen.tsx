import { Box, Text } from "ink";
import type { Artifact, ScanRunState } from "../../domain";
import { Pane } from "../components/Pane";
import { artifactDisplayPath } from "../state/open-artifact";

interface RunArtifactsScreenProps {
  state: ScanRunState;
  selectedArtifactIndex: number;
}

export function RunArtifactsScreen({ state, selectedArtifactIndex }: RunArtifactsScreenProps) {
  const artifact = state.artifacts[selectedArtifactIndex];
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Artifacts" width={44}>
        {state.artifacts.length === 0 ? <Text color="gray">No artifacts yet</Text> : null}
        {state.artifacts.map((item, index) =>
          index === selectedArtifactIndex ? (
            <Text key={item.id} color="cyan">
              ▸ [{item.kind}] {item.title.slice(0, 24)}
            </Text>
          ) : (
            <Text key={item.id}>
              {" "}
              [{item.kind}] {item.title.slice(0, 24)}
            </Text>
          ),
        )}
      </Pane>
      <Pane title="Artifact Details" flexGrow={1}>
        {artifact ? (
          <ArtifactDetails artifact={artifact} runId={state.run.id} />
        ) : (
          <Text color="gray">Waiting for artifacts.</Text>
        )}
      </Pane>
    </Box>
  );
}

function ArtifactDetails({ artifact, runId }: { artifact: Artifact; runId: string }) {
  return (
    <>
      <Text color="cyan">▣ {artifact.title}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Kind: {artifact.kind}</Text>
        <Text>Created: {new Date(artifact.createdAt).toLocaleString()}</Text>
        {artifact.contentType ? <Text>Content type: {artifact.contentType}</Text> : null}
        {artifact.path ? <Text>Path: {artifactDisplayPath(runId, artifact)}</Text> : null}
      </Box>
      <Box marginTop={2} flexDirection="column">
        <Text color="gray">──────────────── Summary ────────────────</Text>
        <Text>{artifact.summary ?? "No summary available."}</Text>
      </Box>
    </>
  );
}
