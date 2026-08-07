import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { ApiRouter } from "./api-router.js";
import { applySecurityHeaders, json } from "./http.js";
import { log } from "./logger.js";
import { PlexGateway } from "./plex-gateway.js";
import { SessionRepository } from "./session-repository.js";
import { serveStatic } from "./static-files.js";

const config = loadConfig();
const sessions = new SessionRepository(config);
await sessions.initialize();
const api = new ApiRouter(sessions, new PlexGateway(config), config);

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
  applySecurityHeaders(response);
  const url = new URL(request.url ?? "/", "http://localhost");
  const operation =
    url.pathname === "/healthz"
      ? Promise.resolve().then(() => {
          response.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
          });
          response.end("ok\n");
        })
      : url.pathname.startsWith("/api/")
        ? api.route({ request, response, url })
        : serveStatic(response, url.pathname, config.staticDirectory);
  void operation.catch((reason: unknown) => {
    log("http.request.failed", {
      error: reason instanceof Error ? reason.name : "UnknownError",
    });
    if (!response.headersSent)
      json(response, 500, { error: "Internal server error" });
    else response.destroy();
  });
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
server.maxHeadersCount = 64;

server.listen(config.port, "0.0.0.0", () =>
  log("server.started", { port: config.port }),
);

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
