import type { Finding } from "../../domain";

const severityRank: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function sortFindingsBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    const severityDelta =
      (severityRank[left.severity] ?? 99) - (severityRank[right.severity] ?? 99);
    if (severityDelta !== 0) return severityDelta;
    return left.title.localeCompare(right.title);
  });
}
