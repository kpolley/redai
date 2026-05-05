import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface BrowserSetupDashboardInput {
  id: string;
  appUrl: string;
  env: NodeJS.ProcessEnv;
  workDir: string;
  port: number;
}

interface BrowserSetupDashboard {
  id: string;
  close(): Promise<void>;
}

const dashboards = new Map<string, BrowserSetupDashboard>();

export async function startBrowserSetupDashboard(input: BrowserSetupDashboardInput): Promise<void> {
  for (const [id, dashboard] of dashboards) {
    if (id !== input.id) {
      await dashboard.close();
      dashboards.delete(id);
    }
  }
  await dashboards.get(input.id)?.close();
  dashboards.delete(input.id);

  const dashboard = await createBrowserSetupDashboard(input);
  dashboards.set(input.id, dashboard);
}

export async function stopBrowserSetupDashboard(id: string): Promise<void> {
  const dashboard = dashboards.get(id);
  if (!dashboard) return;
  dashboards.delete(id);
  await dashboard.close();
}

async function createBrowserSetupDashboard(
  input: BrowserSetupDashboardInput,
): Promise<BrowserSetupDashboard> {
  await mkdir(input.workDir, { recursive: true });
  const screenshotPath = join(input.workDir, "screenshot.png");
  const run = createCommandQueue(input.env);
  const server = createServer((request, response) => {
    void handleRequest({
      request,
      response,
      input,
      run,
      screenshotPath,
    });
  });

  await listen(server, input.port);
  return {
    id: input.id,
    close: () => closeServer(server),
  };
}

function createCommandQueue(env: NodeJS.ProcessEnv) {
  let queue = Promise.resolve();
  return async function run(args: string[], timeout = 20_000): Promise<string> {
    const work = queue.then(async () => {
      const { stdout } = await execFileAsync("agent-browser", args, {
        env,
        timeout,
        maxBuffer: 20 * 1024 * 1024,
      });
      return stdout.trim();
    });
    queue = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  };
}

async function handleRequest({
  request,
  response,
  input,
  run,
  screenshotPath,
}: {
  request: IncomingMessage;
  response: ServerResponse;
  input: BrowserSetupDashboardInput;
  run: (args: string[], timeout?: number) => Promise<string>;
  screenshotPath: string;
}): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, dashboardHtml(input.appUrl));
      return;
    }
    if (request.method === "GET" && url.pathname === "/screenshot") {
      await run(["screenshot", screenshotPath], 30_000);
      const image = await readFile(screenshotPath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "image/png",
      });
      response.end(image);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      const currentUrl = await run(["get", "url"]);
      const title = await run(["get", "title"]);
      sendJson(response, { ok: true, url: currentUrl, title });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/navigate") {
      const body = await readJsonBody(request);
      const targetUrl = stringBodyValue(body, "url");
      if (!targetUrl) throw new Error("Missing URL.");
      await run(["open", targetUrl], 60_000);
      sendJson(response, { ok: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/click") {
      const body = await readJsonBody(request);
      const x = numberBodyValue(body, "x");
      const y = numberBodyValue(body, "y");
      if (x === undefined || y === undefined) throw new Error("Missing click coordinates.");
      await run(["mouse", "move", String(Math.round(x)), String(Math.round(y))]);
      await run(["mouse", "down"]);
      await run(["mouse", "up"]);
      sendJson(response, { ok: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/type") {
      const body = await readJsonBody(request);
      const text = stringBodyValue(body, "text");
      if (!text) throw new Error("Missing text.");
      await run(["keyboard", "type", text]);
      sendJson(response, { ok: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/key") {
      const body = await readJsonBody(request);
      const key = stringBodyValue(body, "key");
      if (!key) throw new Error("Missing key.");
      await run(["press", key]);
      sendJson(response, { ok: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/scroll") {
      const body = await readJsonBody(request);
      const dy = numberBodyValue(body, "dy");
      await run(["mouse", "wheel", String(Math.round(dy ?? 0))]);
      sendJson(response, { ok: true });
      return;
    }
    if (
      request.method === "POST" &&
      ["/api/back", "/api/forward", "/api/reload"].includes(url.pathname)
    ) {
      await run([url.pathname.replace("/api/", "")]);
      sendJson(response, { ok: true });
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    sendJson(
      response,
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

function dashboardHtml(appUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RedAI Browser Setup</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #101418; color: #edf2f7; }
    header { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #29323d; background: #151b21; }
    button, input { border: 1px solid #384452; background: #202832; color: #edf2f7; border-radius: 5px; font: inherit; height: 32px; }
    button { padding: 0 10px; cursor: pointer; }
    button:hover { background: #2a3440; }
    input { padding: 0 9px; }
    #url { flex: 1; min-width: 160px; }
    #typeText { width: 260px; }
    main { display: grid; grid-template-rows: auto 1fr auto; min-height: calc(100vh - 53px); }
    .tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px; border-bottom: 1px solid #29323d; background: #11171d; }
    .viewport { display: flex; align-items: center; justify-content: center; min-height: 0; overflow: auto; padding: 12px; }
    #screen { max-width: 100%; height: auto; border: 1px solid #384452; background: #05070a; cursor: crosshair; }
    footer { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-top: 1px solid #29323d; color: #a7b2bf; font-size: 12px; }
    .error { color: #ff9b9b; }
  </style>
</head>
<body>
  <header>
    <button id="back">Back</button>
    <button id="forward">Forward</button>
    <button id="reload">Reload</button>
    <input id="url" value="${escapeHtml(appUrl)}" spellcheck="false">
    <button id="go">Go</button>
  </header>
  <main>
    <section class="tools">
      <input id="typeText" placeholder="Text to type into focused field" autocomplete="off">
      <button id="typeButton">Type</button>
      <button data-key="Enter">Enter</button>
      <button data-key="Tab">Tab</button>
      <button data-key="Backspace">Backspace</button>
      <button data-key="Escape">Escape</button>
      <button id="refresh">Refresh</button>
    </section>
    <section class="viewport">
      <img id="screen" alt="Browser screenshot">
    </section>
    <footer>
      <span id="status">Loading screenshot...</span>
      <span>Click the screenshot, then type or press keys from the toolbar.</span>
    </footer>
  </main>
  <script>
    const screen = document.getElementById("screen");
    const status = document.getElementById("status");
    const urlInput = document.getElementById("url");
    const typeInput = document.getElementById("typeText");
    let refreshTimer;
    let busy = false;

    function setStatus(text, isError = false) {
      status.textContent = text;
      status.className = isError ? "error" : "";
    }

    async function request(path, body) {
      busy = true;
      setStatus("Working...");
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {})
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error || "Request failed");
        await refresh();
      } catch (error) {
        setStatus(error.message || String(error), true);
      } finally {
        busy = false;
      }
    }

    async function refresh() {
      clearTimeout(refreshTimer);
      const next = "/screenshot?t=" + Date.now();
      await new Promise((resolve, reject) => {
        screen.onload = resolve;
        screen.onerror = () => reject(new Error("Screenshot failed"));
        screen.src = next;
      }).then(() => setStatus("Ready")).catch((error) => setStatus(error.message, true));
      scheduleRefresh();
    }

    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!busy) refresh();
      }, 2500);
    }

    screen.addEventListener("click", (event) => {
      const rect = screen.getBoundingClientRect();
      const x = (event.clientX - rect.left) * screen.naturalWidth / rect.width;
      const y = (event.clientY - rect.top) * screen.naturalHeight / rect.height;
      request("/api/click", { x, y });
    });
    screen.addEventListener("wheel", (event) => {
      event.preventDefault();
      request("/api/scroll", { dy: event.deltaY });
    }, { passive: false });
    document.getElementById("go").onclick = () => request("/api/navigate", { url: urlInput.value });
    urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") request("/api/navigate", { url: urlInput.value });
    });
    document.getElementById("typeButton").onclick = () => request("/api/type", { text: typeInput.value });
    typeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") request("/api/type", { text: typeInput.value });
    });
    document.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("click", () => request("/api/key", { key: button.dataset.key }));
    });
    document.getElementById("back").onclick = () => request("/api/back");
    document.getElementById("forward").onclick = () => request("/api/forward");
    document.getElementById("reload").onclick = () => request("/api/reload");
    document.getElementById("refresh").onclick = () => refresh();
    refresh();
  </script>
</body>
</html>`;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 128 * 1024) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function stringBodyValue(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== "object" || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function numberBodyValue(body: unknown, key: string): number | undefined {
  if (!body || typeof body !== "object" || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html);
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(
          new Error(
            `RedAI browser setup dashboard port ${port} is already in use. Stop the process using that port and reopen environment setup.`,
          ),
        );
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
