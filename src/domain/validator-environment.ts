import { z } from "zod";

export const validatorEnvironmentKindSchema = z.enum(["browser", "ios-simulator"]);
export type ValidatorEnvironmentKind = z.infer<typeof validatorEnvironmentKindSchema>;

export const validatorEnvironmentStatusSchema = z.enum(["draft", "setup", "ready", "failed"]);
export type ValidatorEnvironmentStatus = z.infer<typeof validatorEnvironmentStatusSchema>;

export const browserValidatorEnvironmentSchema = z.object({
  appUrl: z.string(),
  profilePath: z.string(),
  authNotes: z.string().optional(),
});
export type BrowserValidatorEnvironment = z.infer<typeof browserValidatorEnvironmentSchema>;

export const iosValidatorEnvironmentSchema = z.object({
  appPath: z.string().optional(),
  bundleId: z.string().optional(),
  templateDeviceUdid: z.string().optional(),
  deviceName: z.string().optional(),
  runtime: z.string().optional(),
  snapshotPath: z.string().optional(),
  authNotes: z.string().optional(),
});
export type IosValidatorEnvironment = z.infer<typeof iosValidatorEnvironmentSchema>;

export const validatorEnvironmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: validatorEnvironmentKindSchema,
  status: validatorEnvironmentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  browser: browserValidatorEnvironmentSchema.optional(),
  ios: iosValidatorEnvironmentSchema.optional(),
});
export type ValidatorEnvironment = z.infer<typeof validatorEnvironmentSchema>;
