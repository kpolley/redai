import { Box, Text } from "ink";
import type { ScanRunState } from "../../domain";
import { Pane } from "../components/Pane";

interface RunReportScreenProps {
  state: ScanRunState;
  /** Markdown contents of report.md, or undefined while loading / unavailable. */
  content: string | undefined;
  /** Optional load error (e.g., file missing because the run hasn't finished). */
  loadError: string | undefined;
  scrollOffset: number;
  viewportHeight: number;
}

export function RunReportScreen({
  state,
  content,
  loadError,
  scrollOffset,
  viewportHeight,
}: RunReportScreenProps) {
  const headerLines = (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Reports: report.md · report.html · report.json</Text>
    </Box>
  );

  if (state.run.status !== "completed") {
    return (
      <Box flexGrow={1} minHeight={0}>
        <Pane title="Report" flexGrow={1}>
          <Text color="cyan">▣ {state.run.name}</Text>
          {headerLines}
          <Box marginTop={2} flexDirection="column">
            <Text color="gray">
              The report is generated when the scan finishes. Current status: {state.run.status}.
            </Text>
          </Box>
        </Pane>
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box flexGrow={1} minHeight={0}>
        <Pane title="Report" flexGrow={1}>
          <Text color="cyan">▣ {state.run.name}</Text>
          {headerLines}
          <Box marginTop={2} flexDirection="column">
            <Text color="red">Could not load report: {loadError}</Text>
          </Box>
        </Pane>
      </Box>
    );
  }

  if (content === undefined) {
    return (
      <Box flexGrow={1} minHeight={0}>
        <Pane title="Report" flexGrow={1}>
          <Text color="cyan">▣ {state.run.name}</Text>
          {headerLines}
          <Box marginTop={2} flexDirection="column">
            <Text color="gray">Loading…</Text>
          </Box>
        </Pane>
      </Box>
    );
  }

  const lines = content.split(/\r?\n/);
  const visibleLineCount = reportPageSize(viewportHeight);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleLineCount);
  const finalLine = Math.min(lines.length, scrollOffset + visibleLines.length);

  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Report" flexGrow={1}>
        <Text color="cyan">▣ {state.run.name}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Reports: report.md · report.html · report.json</Text>
          <Text color="gray">
            Lines {scrollOffset + 1}-{finalLine} of {lines.length} · ↑↓ scroll · PgUp/PgDn jump
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {visibleLines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stateless text lines; absolute position is a stable key
            <Text key={scrollOffset + index}>{line || " "}</Text>
          ))}
        </Box>
      </Pane>
    </Box>
  );
}

export function reportPageSize(viewportHeight: number): number {
  return Math.max(1, viewportHeight - 8);
}

export function maxReportScrollOffset(content: string | undefined, viewportHeight: number): number {
  if (!content) return 0;
  const lineCount = content.split(/\r?\n/).length;
  return Math.max(0, lineCount - reportPageSize(viewportHeight));
}
