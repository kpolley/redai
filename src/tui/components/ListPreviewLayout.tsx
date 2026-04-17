import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { Pane } from "./Pane";

interface ListPreviewLayoutProps<T> {
  listTitle: string;
  previewTitle?: string;
  items: T[];
  selectedIndex: number;
  listWidth: number;
  emptyListText: string;
  previewEmptyText: string;
  renderRow: (item: T, index: number, selected: boolean) => ReactNode;
  renderPreview: (item: T) => ReactNode;
  visibleRowCount?: number;
}

export function ListPreviewLayout<T>({
  listTitle,
  previewTitle = "Preview",
  items,
  selectedIndex,
  listWidth,
  emptyListText,
  previewEmptyText,
  renderRow,
  renderPreview,
  visibleRowCount = 18,
}: ListPreviewLayoutProps<T>) {
  const window = visibleWindow(items, selectedIndex, visibleRowCount);
  const selectedItem = items[selectedIndex];
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title={listTitle} width={listWidth}>
        {items.length === 0 ? <Text color="gray">{emptyListText}</Text> : null}
        {window.start > 0 ? <Text color="gray"> … {window.start} more above</Text> : null}
        {window.items.map(({ item, index }) => renderRow(item, index, index === selectedIndex))}
        {window.end < items.length ? (
          <Text color="gray"> … {items.length - window.end} more below</Text>
        ) : null}
      </Pane>
      <Pane title={previewTitle} flexGrow={1}>
        {selectedItem ? renderPreview(selectedItem) : <Text color="gray">{previewEmptyText}</Text>}
      </Pane>
    </Box>
  );
}

function visibleWindow<T>(items: T[], selectedIndex: number, windowSize: number) {
  if (items.length === 0) return { start: 0, end: 0, items: [] as { item: T; index: number }[] };
  const safeIndex = Math.max(0, Math.min(items.length - 1, selectedIndex));
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(
    0,
    Math.min(safeIndex - halfWindow, Math.max(0, items.length - windowSize)),
  );
  const end = Math.min(items.length, start + windowSize);
  return {
    start,
    end,
    items: items.slice(start, end).map((item, offset) => ({ item, index: start + offset })),
  };
}
