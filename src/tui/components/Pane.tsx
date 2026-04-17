import { Box, Text } from "ink";
import type { PropsWithChildren } from "react";

interface PaneProps extends PropsWithChildren {
  title: string;
  width?: number | string;
  flexGrow?: number;
}

export function Pane({ title, width, flexGrow, children }: PaneProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      width={width}
      flexGrow={flexGrow}
      height="100%"
    >
      <Text bold color="cyan">
        {title.toUpperCase()}
      </Text>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
