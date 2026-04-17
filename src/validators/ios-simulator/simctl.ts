import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SimulatorClone {
  udid: string;
  name: string;
}

export async function cloneSimulator(
  templateDevice: string,
  cloneName: string,
): Promise<SimulatorClone> {
  await shutdownSimulator(templateDevice);
  const { stdout } = await execFileAsync("xcrun", ["simctl", "clone", templateDevice, cloneName]);
  const udid = stdout.trim().split(/\s+/).at(-1) ?? "";
  if (!udid) throw new Error(`simctl clone did not return a simulator UDID for ${cloneName}.`);
  return { udid, name: cloneName };
}

async function shutdownSimulator(device: string): Promise<void> {
  try {
    await execFileAsync("xcrun", ["simctl", "shutdown", device]);
  } catch {
    // Device may already be shut down.
  }
}

export async function bootSimulator(device: string): Promise<void> {
  try {
    await execFileAsync("xcrun", ["simctl", "boot", device]);
  } catch (error) {
    if (!String(error).includes("Unable to boot device in current state: Booted")) throw error;
  }
  await execFileAsync("xcrun", ["simctl", "bootstatus", device, "-b"]);
  openSimulatorApp();
}

export async function launchSimulatorApp(device: string, bundleId: string): Promise<void> {
  await execFileAsync("xcrun", ["simctl", "launch", device, bundleId]);
  openSimulatorApp();
}

function openSimulatorApp(): void {
  if (process.platform !== "darwin") return;
  spawn("open", ["-a", "Simulator"], { detached: true, stdio: "ignore" }).unref();
}

export async function deleteSimulator(device: string): Promise<void> {
  await shutdownSimulator(device);
  await execFileAsync("xcrun", ["simctl", "delete", device]);
}
