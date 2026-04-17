import { Box, Text } from "ink";

export interface TabBarTab<T extends string> {
  id: T;
  label: string;
}

interface TabBarProps<T extends string> {
  tabs: TabBarTab<T>[];
  activeTab: T;
  hint?: string;
}

export function TabBar<T extends string>({ tabs, activeTab, hint }: TabBarProps<T>) {
  return (
    <Box paddingX={1} borderBottom>
      <Box gap={1} flexGrow={1}>
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Text key={tab.id} inverse={active} color={active ? "cyan" : "gray"}>
              {` ${tab.label} `}
            </Text>
          );
        })}
      </Box>
      {hint ? <Text color="gray">{hint}</Text> : null}
    </Box>
  );
}
