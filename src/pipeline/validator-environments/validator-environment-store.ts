import type { ValidatorEnvironment } from "../../domain";

export interface CreateValidatorEnvironmentInput {
  name: string;
  kind: ValidatorEnvironment["kind"];
  status?: ValidatorEnvironment["status"];
  browser?: ValidatorEnvironment["browser"];
  ios?: ValidatorEnvironment["ios"];
}

export interface ValidatorEnvironmentStore {
  listEnvironments(): Promise<ValidatorEnvironment[]>;
  getEnvironment(environmentId: string): Promise<ValidatorEnvironment | undefined>;
  createEnvironment(input: CreateValidatorEnvironmentInput): Promise<ValidatorEnvironment>;
  updateEnvironment(environment: ValidatorEnvironment): Promise<ValidatorEnvironment>;
  deleteEnvironment(environmentId: string): Promise<void>;
}
