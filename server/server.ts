import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const DATA_DIRECTORY = process.env.DATA_DIRECTORY ?? "/data";
const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  readFileSync(
    process.env.SESSION_SECRET_FILE ?? "/run/secrets/session_secret",
    "utf8",
  ).trim();
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
const SESSION_FILE = join(DATA_DIRECTORY, "sessions.enc");
const STATIC_DIRECTORY = process.env.STATIC_DIRECTORY ?? "/app/dist";
const SESSION_COOKIE = "plex_rating_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PLEX_PRODUCT = "Plex Rating Quest";
const PLEX_VERSION = process.env.APP_VERSION ?? "development";
const PLEX_PIN_URL = "https://plex.tv/api/v2/pins";
const PLEX_RESOURCES_URL =
  "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1";
const PLEX_USER_URL = "https://plex.tv/api/v2/user";
const PLEX_COMMUNITY_URL = "https://community.plex.tv/api";

interface PendingPin {
  readonly id: number;
  readonly code: string;
  readonly createdAt: number;
}

interface ServerConnection {
  readonly uri: string;
  readonly token: string;
}

interface SessionRecord {
  readonly createdAt: number;
  updatedAt: number;
  pendingPin?: PendingPin;
  token?: string;
  servers: Record<string, readonly ServerConnection[]>;
}

type SessionStore = Record<string, SessionRecord>;

interface PlexPinResponse {
  readonly id: number;
  readonly code: string;
  readonly authToken?: string | null;
}

interface PlexConnectionResponse {
  readonly uri: string;
  readonly local?: boolean;
  readonly relay?: boolean;
}

interface PlexResourceResponse {
  readonly name: string;
  readonly provides: string;
  readonly accessToken?: string;
  readonly connections: readonly PlexConnectionResponse[];
}

function validateConfiguration(): void {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535)
    throw new Error("PORT must be an integer from 1 through 65535");
  if (SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
}

const encryptionKey = createHash("sha256").update(SESSION_SECRET).digest();
const clientIdentifier = createHash("sha256")
  .update(`plex-rating-quest:${SESSION_SECRET}`)
  .digest("hex")
  .slice(0, 32);
let sessions: SessionStore = {};
let persistenceQueue: Promise<void> = Promise.resolve();

function log(
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`,
  );
}

function plexHeaders(token?: string): Headers {
  return new Headers({
    Accept: "application/json",
    "X-Plex-Client-Identifier": clientIdentifier,
    "X-Plex-Product": PLEX_PRODUCT,
    "X-Plex-Version": PLEX_VERSION,
    ...(token === undefined ? {} : { "X-Plex-Token": token }),
  });
}

async function loadSessions(): Promise<void> {
  try {
    const encoded = await readFile(SESSION_FILE, "utf8");
    const payload = Buffer.from(encoded, "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(tag);
    sessions = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
      ),
    ) as SessionStore;
    log("session.store.loaded", { sessionCount: Object.keys(sessions).length });
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        "Unable to decrypt the session store; verify SESSION_SECRET",
        {
          cause: reason,
        },
      );
  }
}

async function writeSessions(): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(sessions), "utf8"),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
  const temporaryFile = `${SESSION_FILE}.tmp`;
  await writeFile(temporaryFile, payload, { mode: 0o600 });
  await rename(temporaryFile, SESSION_FILE);
}

async function persistSessions(): Promise<void> {
  persistenceQueue = persistenceQueue.then(writeSessions, writeSessions);
  await persistenceQueue;
}

function cookieValue(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE);
  return cookie?.[1] ?? null;
}

function getSession(
  request: IncomingMessage,
): { id: string; record: SessionRecord } | null {
  const id = cookieValue(request);
  if (id === null) return null;
  const record = sessions[id];
  if (record === undefined) return null;
  if (Date.now() - record.updatedAt > SESSION_MAX_AGE_SECONDS * 1000) {
    Reflect.deleteProperty(sessions, id);
    return null;
  }
  return { id, record };
}

function createSession(response: ServerResponse): {
  id: string;
  record: SessionRecord;
} {
  const id = randomBytes(32).toString("base64url");
  const record: SessionRecord = {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    servers: {},
  };
  sessions[id] = record;
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${id}; Path=/; HttpOnly;${COOKIE_SECURE ? " Secure;" : ""} SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
  return { id, record };
}

function clearSessionCookie(response: ServerResponse): void {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly;${COOKIE_SECURE ? " Secure;" : ""} SameSite=Lax; Max-Age=0`,
  );
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' data: blob: https:; manifest-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function requireSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers["x-forwarded-host"];
    const host =
      (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ??
      request.headers.host;
    return host !== undefined && originUrl.host === host;
  } catch {
    return false;
  }
}

async function plexFetch(
  url: string | URL,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    log("plex.request.completed", {
      operation,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  } catch (reason) {
    log("plex.request.failed", {
      operation,
      durationMs: Math.round(performance.now() - startedAt),
      error: reason instanceof Error ? reason.name : "UnknownError",
    });
    throw reason;
  }
}

async function createPin(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!requireSameOrigin(request))
    return json(response, 403, { error: "Invalid request origin" });
  const session = getSession(request) ?? createSession(response);
  const headers = plexHeaders();
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  const upstream = await plexFetch(
    PLEX_PIN_URL,
    { method: "POST", headers, body: new URLSearchParams({ strong: "true" }) },
    "pin.create",
  );
  if (!upstream.ok)
    return json(response, 502, { error: "Plex PIN creation failed" });
  const pin = (await upstream.json()) as PlexPinResponse;
  session.record.pendingPin = {
    id: pin.id,
    code: pin.code,
    createdAt: Date.now(),
  };
  session.record.updatedAt = Date.now();
  await persistSessions();
  json(response, 200, {
    id: pin.id,
    code: pin.code,
    clientId: clientIdentifier,
  });
}

async function pollPin(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const session = getSession(request);
  if (session === null)
    return json(response, 401, { error: "No pending Plex sign-in" });
  const pin = session.record.pendingPin;
  if (pin === undefined)
    return json(response, 401, { error: "No pending Plex sign-in" });
  if (Date.now() - pin.createdAt > 10 * 60 * 1000)
    return json(response, 410, { error: "Plex sign-in expired" });
  const url = new URL(`${PLEX_PIN_URL}/${pin.id}`);
  url.searchParams.set("code", pin.code);
  const upstream = await plexFetch(url, { headers: plexHeaders() }, "pin.poll");
  if (!upstream.ok)
    return json(response, 502, { error: "Plex sign-in check failed" });
  const result = (await upstream.json()) as PlexPinResponse;
  if (result.authToken === undefined || result.authToken === null)
    return json(response, 200, { authenticated: false });
  session.record.token = result.authToken;
  delete session.record.pendingPin;
  session.record.updatedAt = Date.now();
  await persistSessions();
  json(response, 200, { authenticated: true });
}

async function logout(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!requireSameOrigin(request))
    return json(response, 403, { error: "Invalid request origin" });
  const session = getSession(request);
  if (session !== null) Reflect.deleteProperty(sessions, session.id);
  clearSessionCookie(response);
  await persistSessions();
  response.writeHead(204, { "Cache-Control": "no-store" });
  response.end();
}

async function authenticatedProxy(
  request: IncomingMessage,
  response: ServerResponse,
  target: string,
  operation: string,
): Promise<void> {
  const session = getSession(request);
  if (session?.record.token === undefined)
    return json(response, 401, { error: "Plex authentication required" });
  const headers = plexHeaders(session.record.token);
  if (request.headers["content-type"] !== undefined)
    headers.set("Content-Type", request.headers["content-type"]);
  const body =
    request.method === "POST" || request.method === "PUT"
      ? await readRequestBody(request)
      : undefined;
  const upstream = await plexFetch(
    target,
    {
      method: request.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
    },
    operation,
  );
  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  response.writeHead(upstream.status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function resources(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const session = getSession(request);
  if (session?.record.token === undefined)
    return json(response, 401, { error: "Plex authentication required" });
  const upstream = await plexFetch(
    PLEX_RESOURCES_URL,
    { headers: plexHeaders(session.record.token) },
    "server.discovery",
  );
  if (!upstream.ok)
    return json(response, upstream.status, {
      error: "Plex server discovery failed",
    });
  const result = (await upstream.json()) as PlexResourceResponse[];
  const rewritten = result.map((resource, resourceIndex) => {
    const serverId = createHash("sha256")
      .update(`${resource.name}:${resourceIndex}`)
      .digest("hex")
      .slice(0, 16);
    const token = resource.accessToken ?? session.record.token ?? "";
    const validConnections = resource.connections.filter((connection) => {
      try {
        const protocol = new URL(connection.uri).protocol;
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    });
    session.record.servers[serverId] = validConnections.map((connection) => ({
      uri: connection.uri,
      token,
    }));
    return {
      name: resource.name,
      provides: resource.provides,
      connections: validConnections.map((connection, index) => ({
        ...connection,
        uri: `/api/plex/server/${serverId}/${index}`,
      })),
    };
  });
  session.record.updatedAt = Date.now();
  await persistSessions();
  json(response, 200, rewritten);
}

async function serverProxy(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  search: string,
): Promise<void> {
  const session = getSession(request);
  if (session?.record.token === undefined)
    return json(response, 401, { error: "Plex authentication required" });
  const match = /^\/api\/plex\/server\/([a-f0-9]{16})\/(\d+)(\/.*)?$/.exec(
    pathname,
  );
  if (match === null)
    return json(response, 404, { error: "Unknown Plex server path" });
  const [, serverId, connectionIndexText, remainder = "/"] = match;
  const connectionIndex = Number.parseInt(connectionIndexText ?? "", 10);
  const connection =
    serverId === undefined
      ? undefined
      : session.record.servers[serverId]?.[connectionIndex];
  if (connection === undefined)
    return json(response, 404, { error: "Unknown Plex server connection" });
  const target = new URL(remainder, `${connection.uri}/`);
  target.search = search;
  target.searchParams.delete("X-Plex-Token");
  const headers = plexHeaders(connection.token);
  const upstream = await plexFetch(
    target,
    { method: request.method ?? "GET", headers },
    "server.proxy",
  );
  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  response.writeHead(upstream.status, {
    "Content-Type": contentType,
    "Cache-Control": contentType.startsWith("image/")
      ? "private, max-age=3600"
      : "no-store",
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function staticFile(
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  const normalized = normalize(pathname).replace(/^\/+/, "");
  let file = join(STATIC_DIRECTORY, normalized);
  if (file !== STATIC_DIRECTORY && !file.startsWith(`${STATIC_DIRECTORY}/`))
    return json(response, 404, { error: "Not found" });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(STATIC_DIRECTORY, "index.html");
  }
  try {
    const details = await stat(file);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
      "Content-Length": details.size,
      "Cache-Control": file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

async function authRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (url.pathname === "/api/auth/pin" && request.method === "POST")
    return createPin(request, response);
  if (url.pathname === "/api/auth/status" && request.method === "GET")
    return pollPin(request, response);
  if (url.pathname === "/api/auth/logout" && request.method === "POST")
    return logout(request, response);
  return json(response, 404, { error: "API route not found" });
}

async function plexRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (url.pathname === "/api/plex/user" && request.method === "GET")
    return authenticatedProxy(
      request,
      response,
      PLEX_USER_URL,
      "account.fetch",
    );
  if (url.pathname === "/api/plex/resources" && request.method === "GET")
    return resources(request, response);
  if (url.pathname === "/api/plex/community" && request.method === "POST")
    return authenticatedProxy(
      request,
      response,
      PLEX_COMMUNITY_URL,
      "community.fetch",
    );
  if (url.pathname.startsWith("/api/plex/server/"))
    return serverProxy(request, response, url.pathname, url.search);
  return json(response, 404, { error: "API route not found" });
}

async function apiRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  const isMutation = request.method !== "GET" && request.method !== "HEAD";
  if (isMutation && !requireSameOrigin(request))
    return json(response, 403, { error: "Invalid request origin" });
  return url.pathname.startsWith("/api/auth/")
    ? authRoute(request, response, url)
    : plexRoute(request, response, url);
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  securityHeaders(response);
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok\n");
    return;
  }
  if (url.pathname.startsWith("/api/")) return apiRoute(request, response, url);
  return staticFile(response, url.pathname);
}

validateConfiguration();
await mkdir(DATA_DIRECTORY, { recursive: true, mode: 0o700 });
await loadSessions();

const server = createServer((request, response) => {
  const startedAt = performance.now();
  response.on("finish", () => {
    log("http.request", {
      method: request.method,
      path: new URL(request.url ?? "/", "http://localhost").pathname,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  void route(request, response).catch((reason: unknown) => {
    log("http.request.failed", {
      error: reason instanceof Error ? reason.name : "UnknownError",
    });
    if (!response.headersSent)
      json(response, 500, { error: "Internal server error" });
    else response.destroy();
  });
});

server.listen(PORT, "0.0.0.0", () => log("server.started", { port: PORT }));

function shutdown(signal: string): void {
  log("server.shutdown", { signal });
  server.close((error) => {
    if (error !== undefined) {
      log("server.shutdown.failed", { error: error.name });
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
