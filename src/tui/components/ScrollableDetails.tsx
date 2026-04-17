import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { Pane } from "./Pane";

interface ScrollableDetailsProps<T> {
  title: string;
  lines: T[];
  scrollOffset: number;
  viewportHeight: number;
  renderLine: (line: T, index: number) => ReactNode;
  pageSize?: (viewportHeight: number) => number;
}

export function ScrollableDetails<T>({
  title,
  lines,
  scrollOffset,
  viewportHeight,
  renderLine,
  pageSize = defaultDetailsPageSize,
}: ScrollableDetailsProps<T>) {
  const visibleLineCount = pageSize(viewportHeight);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleLineCount);
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title={title} flexGrow={1}>
        {scrollOffset > 0 ? <Text color="gray">↑ {scrollOffset} more lines</Text> : null}
        {visibleLines.map((line, index) => renderLine(line, scrollOffset + index))}
        {scrollOffset + visibleLineCount < lines.length ? (
          <Text color="gray">↓ {lines.length - scrollOffset - visibleLineCount} more lines</Text>
        ) : null}
      </Pane>
    </Box>
  );
}

export function defaultDetailsPageSize(viewportHeight: number): number {
  return Math.max(5, viewportHeight - 8);
}

export function maxScrollOffset(
  lineCount: number,
  viewportHeight: number,
  pageSize: (viewportHeight: number) => number = defaultDetailsPageSize,
): number {
  return Math.max(0, lineCount - pageSize(viewportHeight));
}
