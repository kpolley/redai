import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScanRunState, ScanRunSummary, ValidatorEnvironment } from "../../domain";
import { LocalRedaiRuntime } from "../../pipeline/local-redai-runtime";
import type { RedaiRuntime } from "../../pipeline/project-session";

export interface RuntimeSnapshot {
  runtime: RedaiRuntime;
  runs: ScanRunSummary[];
  validatorEnvironments: ValidatorEnvironment[];
  selectedRun: ScanRunState | undefined;
  refresh(): Promise<void>;
}

export function useRedaiRuntime(selectedRunId?: string): RuntimeSnapshot {
  const runtime = useMemo(() => new LocalRedaiRuntime(), []);
  const [runs, setRuns] = useState<ScanRunSummary[]>([]);
  const [validatorEnvironments, setValidatorEnvironments] = useState<ValidatorEnvironment[]>([]);
  const [selectedRun, setSelectedRun] = useState<ScanRunState | undefined>();

  const refresh = useCallback(async () => {
    const nextRuns = await runtime.listRuns();
    setValidatorEnvironments(await runtime.listValidatorEnvironments());
    setRuns(nextRuns);
    if (selectedRunId) {
      setSelectedRun(await runtime.getRun(selectedRunId));
    } else {
      setSelectedRun(undefined);
    }
  }, [runtime, selectedRunId]);

  useEffect(() => {
    void refresh();
    return runtime.subscribe(() => {
      void refresh();
    });
  }, [runtime, refresh]);

  return { runtime, runs, validatorEnvironments, selectedRun, refresh };
}
