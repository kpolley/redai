const SESSION_SECRET = "shopnorth-session-signing-key";

export function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, username: user.username, role: user.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = Buffer.from(`${payload}.${SESSION_SECRET}`).toString("base64url");
  return `${payload}.${signature}`;
}

export function requireUser(req) {
  const token = readToken(req);
  if (!token) return undefined;
  try {
    const [payload] = token.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function requireAdmin(req) {
  return requireUser(req);
}

function readToken(req) {
  const headerToken = req.headers.authorization?.replace("Bearer ", "");
  if (headerToken) return headerToken;
  const cookie = req.headers.cookie || "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("session="))?.slice("session=".length);
}
