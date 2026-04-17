import type { ScanRunState } from "../domain";
import type { ValidatorPlugin } from "../validators/validator-plugin";

export async function findValidatorsForRun(
  state: ScanRunState,
  validators: ValidatorPlugin[],
): Promise<ValidatorPlugin[]> {
  const matched: ValidatorPlugin[] = [];
  for (const validator of validators) {
    for (const finding of state.findings) {
      const result = await validator.canValidate({ runState: state, findingId: finding.id });
      if (result.supported) {
        matched.push(validator);
        break;
      }
    }
  }
  return matched;
}
