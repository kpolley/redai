import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSession, requireUser, requireAdmin } from "./auth/session.js";
import { findUserByUsername, findUserById, publicUser, users, products, orders } from "./db/users.js";

const publicDir = join(process.cwd(), "public");

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost:3000");

  if (req.method === "GET" && url.pathname === "/") return sendFile(res, "index.html", "text/html");
  if (req.method === "GET" && url.pathname === "/app.js") return sendFile(res, "app.js", "text/javascript");
  if (req.method === "GET" && url.pathname === "/style.css") return sendFile(res, "style.css", "text/css");

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const user = findUserByUsername(body.username);
    if (!user || user.password !== body.password) return json(res, 401, { error: "invalid credentials" });
    const token = createSession(user);
    res.setHeader("set-cookie", `session=${token}; Path=/; SameSite=Lax`);
    return json(res, 200, { token, user: publicUser(user) });
  }


  if (req.method === "GET" && url.pathname === "/api/products") {
    return json(res, 200, products);
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    res.setHeader("set-cookie", "session=; Path=/; Max-Age=0; SameSite=Lax");
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const session = requireUser(req);
    if (!session) return json(res, 401, { error: "login required" });
    const user = findUserById(session.id);
    if (!user) return json(res, 401, { error: "invalid session" });
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const user = requireAdmin(req);
    if (!user) return json(res, 401, { error: "login required" });
    return json(res, 200, users);
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/profile/")) {
    const user = requireUser(req);
    if (!user) return json(res, 401, { error: "login required" });
    const profile = findUserById(url.pathname.split("/").pop());
    if (!profile) return json(res, 404, { error: "missing" });
    return json(res, 200, profile);
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/orders/")) {
    const user = requireUser(req);
    if (!user) return json(res, 401, { error: "login required" });
    const order = orders.find((item) => item.id === url.pathname.split("/").pop());
    if (!order) return json(res, 404, { error: "missing" });
    return json(res, 200, order);
  }

  if (req.method === "POST" && url.pathname === "/api/returns/export") {
    const user = requireUser(req);
    if (!user) return json(res, 401, { error: "login required" });
    const body = await readJson(req);
    const targetPath = join(process.cwd(), "src", "uploads", body.filename || "export.txt");
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, body.content || "");
    return json(res, 200, { path: targetPath });
  }

  return json(res, 404, { error: "not found" });
});

server.listen(3000, () => {
  console.log("RedAI E2E target listening on http://localhost:3000");
});

function sendFile(res, filename, contentType) {
  res.writeHead(200, { "content-type": contentType });
  res.end(readFileSync(join(publicDir, filename)));
}

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value, null, 2));
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
    });
  });
}
