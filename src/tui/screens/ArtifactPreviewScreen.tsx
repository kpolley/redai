import { Box, Text } from "ink";
import type { Artifact } from "../../domain";
import { Pane } from "../components/Pane";
import { artifactDisplayPath } from "../state/open-artifact";

interface ArtifactPreviewScreenProps {
  runId: string;
  artifact: Artifact;
  content: string;
  scrollOffset: number;
  viewportHeight: number;
}

export function ArtifactPreviewScreen({
  runId,
  artifact,
  content,
  scrollOffset,
  viewportHeight,
}: ArtifactPreviewScreenProps) {
  const lines = formatPreview(content);
  const visibleLineCount = Math.max(1, viewportHeight - 8);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleLineCount);
  const finalLine = Math.min(lines.length, scrollOffset + visibleLines.length);
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Artifact Preview" flexGrow={1}>
        <Text color="cyan">▣ {artifact.title}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Kind: {artifact.kind}</Text>
          {artifact.contentType ? <Text>Content type: {artifact.contentType}</Text> : null}
          {artifact.path ? <Text>Path: {artifactDisplayPath(runId, artifact)}</Text> : null}
          <Text color="gray">
            Lines {scrollOffset + 1}-{finalLine} of {lines.length} · ↑↓ scroll · PgUp/PgDn jump
          </Text>
        </Box>
        <Box marginTop={2} flexDirection="column">
          {visibleLines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stateless text lines; absolute position is a stable key
            <Text key={scrollOffset + index}>{line}</Text>
          ))}
        </Box>
      </Pane>
    </Box>
  );
}

function formatPreview(content: string): string[] {
  return content.split(/\r?\n/);
}
