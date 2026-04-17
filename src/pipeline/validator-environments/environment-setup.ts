import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import type { ValidatorEnvironment } from "../../domain";

const execFileAsync = promisify(execFile);

export async function openValidatorEnvironmentSetup(
  environment: ValidatorEnvironment,
): Promise<ValidatorEnvironment> {
  if (environment.kind === "browser") {
    await openBrowserEnvironmentSetup(environment);
    return environment;
  }
  return openIosEnvironmentSetup(environment);
}

export async function closeValidatorEnvironmentSetup(
  environment: ValidatorEnvironment,
): Promise<void> {
  if (environment.kind === "browser") {
    await closeBrowserEnvironmentSetup(environment);
    return;
  }
  await closeIosEnvironmentSetup(environment);
}

async function openBrowserEnvironmentSetup(environment: ValidatorEnvironment): Promise<void> {
  const appUrl = environment.browser?.appUrl;
  const profilePath = environment.browser?.profilePath;
  if (!appUrl || !profilePath)
    throw new Error("Browser environment requires app URL and profile path.");

  await mkdir(profilePath, { recursive: true });
  if (process.platform === "darwin") {
    spawn("open", ["-na", "Google Chrome", "--args", `--user-data-dir=${profilePath}`, appUrl], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  const browser = process.platform === "win32" ? "chrome" : "google-chrome";
  spawn(browser, [`--user-data-dir=${profilePath}`, appUrl], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function closeBrowserEnvironmentSetup(environment: ValidatorEnvironment): Promise<void> {
  const profilePath = environment.browser?.profilePath;
  if (!profilePath) return;
  try {
    await execFileAsync("pkill", ["-f", `--user-data-dir=${profilePath}`]);
  } catch {
    // Browser may already be closed.
  }
}

async function openIosEnvironmentSetup(
  environment: ValidatorEnvironment,
): Promise<ValidatorEnvironment> {
  const appPath = environment.ios?.appPath?.trim();
  const bundleId = environment.ios?.bundleId?.trim();
  if (!appPath && !bundleId) throw new Error("iOS environment requires an app path or bundle ID.");

  let target = environment.ios?.templateDeviceUdid?.trim() || environment.ios?.deviceName?.trim();
  if (!target || target === "booted") {
    target = await createTemplateSimulator(environment.name);
  }
  if (appPath) {
    await execFileAsync("xcrun", ["simctl", "install", target, appPath]);
  }
  if (bundleId) {
    await execFileAsync("xcrun", ["simctl", "launch", target, bundleId]);
  }
  if (process.platform === "darwin") {
    spawn("open", ["-a", "Simulator"], { detached: true, stdio: "ignore" }).unref();
  }
  return {
    ...environment,
    ios: { ...environment.ios, templateDeviceUdid: target, deviceName: target },
  };
}

async function closeIosEnvironmentSetup(environment: ValidatorEnvironment): Promise<void> {
  const target = environment.ios?.templateDeviceUdid?.trim() || environment.ios?.deviceName?.trim();
  if (!target) return;
  try {
    await execFileAsync("xcrun", ["simctl", "shutdown", target]);
  } catch {
    // Simulator may already be shut down.
  }
}

async function createTemplateSimulator(environmentName: string): Promise<string> {
  const deviceType = await firstAvailableDeviceType();
  const runtime = await latestAvailableRuntime();
  const name = `redai-template-${safePathPart(environmentName)}-${Date.now().toString(36)}`;
  const { stdout } = await execFileAsync("xcrun", ["simctl", "create", name, deviceType, runtime]);
  const udid = stdout.trim();
  await execFileAsync("xcrun", ["simctl", "boot", udid]);
  await execFileAsync("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  return udid;
}

async function firstAvailableDeviceType(): Promise<string> {
  const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devicetypes", "--json"]);
  const parsed = JSON.parse(stdout) as { devicetypes: { identifier: string; name: string }[] };
  return (
    parsed.devicetypes.find((device) => device.name.includes("iPhone"))?.identifier ??
    parsed.devicetypes[0]?.identifier ??
    "com.apple.CoreSimulator.SimDeviceType.iPhone-16"
  );
}

async function latestAvailableRuntime(): Promise<string> {
  const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "runtimes", "--json"]);
  const parsed = JSON.parse(stdout) as {
    runtimes: { identifier: string; platform: string; isAvailable: boolean }[];
  };
  const runtimes = parsed.runtimes.filter(
    (runtime) => runtime.isAvailable && runtime.platform === "iOS",
  );
  return (
    runtimes.at(-1)?.identifier ??
    parsed.runtimes.find((runtime) => runtime.isAvailable)?.identifier ??
    "com.apple.CoreSimulator.SimRuntime.iOS-26-3"
  );
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48) || "environment";
}
