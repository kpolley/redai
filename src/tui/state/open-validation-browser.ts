import { spawn } from "node:child_process";

export function openValidationDashboard(agentBrowserHome: string | undefined): void {
  if (!agentBrowserHome) return;
  const env = { ...process.env, AGENT_BROWSER_HOME: agentBrowserHome };
  spawn("agent-browser", ["dashboard", "start"], { detached: true, stdio: "ignore", env }).unref();
  openUrl("http://localhost:4848");
}

function openUrl(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
