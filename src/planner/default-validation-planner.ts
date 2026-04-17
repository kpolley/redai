import type { Finding, ScanRun, ValidationPlan, ValidatorEnvironment } from "../domain";
import { FilesystemValidatorEnvironmentStore } from "../pipeline/validator-environments/filesystem-validator-environment-store";

export interface ValidationPlannerInput {
  run: ScanRun;
  findings: Finding[];
}

export interface ValidationPlanner {
  createPlans(input: ValidationPlannerInput): Promise<ValidationPlan[]>;
}

export class DefaultValidationPlanner implements ValidationPlanner {
  async createPlans({ run, findings }: ValidationPlannerInput): Promise<ValidationPlan[]> {
    const environment = await new FilesystemValidatorEnvironmentStore().getEnvironment(
      run.settings.validatorEnvironmentId,
    );
    if (!environment) return [];
    return findings.map((finding) => ({
      id: crypto.randomUUID(),
      findingId: finding.id,
      validatorId: validatorIdFor(environment),
      goal: finding.validationNotes.suspectedVulnerability,
      steps: finding.validationNotes.confirmationActions,
      metadata: { ...metadataFor(environment), scannerProvider: run.settings.scannerProvider },
    }));
  }
}

function validatorIdFor(environment: ValidatorEnvironment): string {
  if (environment.kind === "ios-simulator") return "ios-simulator";
  return "web-agent-browser";
}

function metadataFor(environment: ValidatorEnvironment): Record<string, unknown> {
  if (environment.kind === "browser")
    return {
      appUrl: environment.browser?.appUrl,
      profilePath: environment.browser?.profilePath,
      authNotes: environment.browser?.authNotes,
      validatorEnvironmentId: environment.id,
    };
  if (environment.kind === "ios-simulator") {
    return {
      appPath: environment.ios?.appPath,
      bundleId: environment.ios?.bundleId,
      templateDeviceUdid: environment.ios?.templateDeviceUdid,
      deviceName: environment.ios?.deviceName,
      runtime: environment.ios?.runtime,
      snapshotPath: environment.ios?.snapshotPath,
      authNotes: environment.ios?.authNotes,
      validatorEnvironmentId: environment.id,
    };
  }
  return {};
}
