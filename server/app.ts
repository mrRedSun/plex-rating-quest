import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  LogController,
} from "fastify";
import type { Writable } from "node:stream";
import pino from "pino";
import type { AppConfig } from "./config.js";
import type { SessionContext } from "./domain.js";
import { PlexGateway } from "./plex-gateway.js";
import { SessionRepository } from "./session-repository.js";

const SESSION_COOKIE = "plex_rating_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionCookie(config: AppConfig): {
  readonly path: string;
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly maxAge: number;
} {
  return {
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function logOperation(request: FastifyRequest): string {
  const route = request.routeOptions.url;
  if (
    route !== undefined &&
    (route === "/healthz" || route.startsWith("/api/"))
  )
    return route;
  return "static";
}

function rateLimitConfig(
  max: number,
  timeWindow = "1 minute",
): {
  readonly config: {
    readonly rateLimit: { readonly max: number; readonly timeWindow: string };
  };
} {
  return { config: { rateLimit: { max, timeWindow } } } as const;
}

function safeStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined;
  const frames = error.stack.split("\n").slice(1).join("\n").trim();
  return frames.length > 0 ? frames : undefined;
}

function authenticated(
  request: FastifyRequest,
  reply: FastifyReply,
  sessions: SessionRepository,
): SessionContext | null {
  const session = sessions.get(request.cookies[SESSION_COOKIE]);
  if (session?.record.token !== undefined) return session;
  void reply.code(401).send({ error: "Plex authentication required" });
  return null;
}

export async function buildApp(
  config: AppConfig,
  options: { readonly logStream?: Writable } = {},
): Promise<{
  readonly app: FastifyInstance;
  readonly sessions: SessionRepository;
}> {
  const loggerOptions = {
    level: config.logLevel,
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers.set-cookie",
        "body",
        "query",
        "params",
        "token",
        "pin",
        "code",
        "uri",
        "url",
      ],
      censor: "[REDACTED]",
    },
  };
  const logger: FastifyBaseLogger =
    options.logStream === undefined
      ? pino(loggerOptions)
      : pino(loggerOptions, options.logStream);
  const app = Fastify({
    trustProxy: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
    maxRequestsPerSocket: 100,
    logController: new LogController({ disableRequestLogging: true }),
    loggerInstance: logger,
  });
  const sessions = new SessionRepository(config);
  await sessions.initialize();
  const plex = new PlexGateway(config, undefined, {
    info: (fields, message) => app.log.info(fields, message),
    warn: (fields, message) => app.log.warn(fields, message),
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        manifestSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ error: "Too many requests" }),
  });
  await app.register(fastifyStatic, {
    root: config.staticDirectory,
    prefix: "/",
    maxAge: "1y",
    immutable: true,
    wildcard: false,
    setHeaders: (response: FastifyReply, filePath: string) => {
      if (filePath.endsWith("/index.html"))
        void response.header("Cache-Control", "no-store");
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (request.headers.origin === config.publicOrigin) return;
    await reply.code(403).send({ error: "Invalid request origin" });
  });
  app.addHook("onResponse", (request, reply, done) => {
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        operation: logOperation(request),
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed",
    );
    done();
  });

  app.get("/healthz", () => "ok\n");
  app.post(
    "/api/auth/pin",
    rateLimitConfig(10, "1 hour"),
    async (_request, reply) => {
      const pin = await plex.createPin();
      const session = sessions.create();
      session.record.pendingPin = {
        id: pin.id,
        code: pin.code,
        createdAt: Date.now(),
      };
      sessions.persist(session);
      return reply
        .setCookie(SESSION_COOKIE, session.id, sessionCookie(config))
        .send({ id: pin.id, code: pin.code, clientId: plex.clientIdentifier });
    },
  );
  app.post("/api/auth/status", rateLimitConfig(120), async (request, reply) => {
    const session = sessions.get(request.cookies[SESSION_COOKIE]);
    const pin = session?.record.pendingPin;
    if (session === null || pin === undefined)
      return reply.code(401).send({ error: "No pending Plex sign-in" });
    if (Date.now() - pin.createdAt > 10 * 60 * 1000)
      return reply.code(410).send({ error: "Plex sign-in expired" });
    const result = await plex.pollPin(pin.id, pin.code);
    if (result.authToken === undefined || result.authToken === null)
      return { authenticated: false };
    session.record.token = result.authToken;
    Reflect.deleteProperty(session.record, "pendingPin");
    const rotated = sessions.rotate(session);
    return reply
      .setCookie(SESSION_COOKIE, rotated.id, sessionCookie(config))
      .send({ authenticated: true });
  });
  app.get("/api/auth/session", rateLimitConfig(300), (request) => {
    const session = sessions.get(request.cookies[SESSION_COOKIE]);
    return {
      authenticated: session?.record.token !== undefined,
      account: session?.record.account ?? null,
    };
  });
  app.post("/api/auth/logout", rateLimitConfig(60), async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE];
    if (id !== undefined) sessions.delete(id);
    return reply
      .clearCookie(SESSION_COOKIE, sessionCookie(config))
      .code(204)
      .send();
  });
  app.get("/api/plex/user", rateLimitConfig(120), async (request, reply) => {
    const session = authenticated(request, reply, sessions);
    if (session === null) return;
    const account = await plex.account(session.record);
    sessions.persist(session);
    return account;
  });
  app.get(
    "/api/plex/resources",
    rateLimitConfig(120),
    async (request, reply) => {
      const session = authenticated(request, reply, sessions);
      if (session === null) return;
      const resources = await plex.discover(session.record);
      sessions.persist(session);
      return resources;
    },
  );
  app.post<{ Body: unknown }>(
    "/api/plex/community",
    rateLimitConfig(120),
    async (request, reply) => {
      const session = authenticated(request, reply, sessions);
      if (session === null) return;
      const upstream = await plex.proxyCommunity(session.record, request.body);
      reply.hijack();
      await plex.pipe(reply.raw, upstream);
    },
  );
  app.route({
    method: ["GET", "PUT"],
    url: "/api/plex/server/:serverId/:connectionIndex/*",
    config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const session = authenticated(request, reply, sessions);
      if (session === null) return;
      const url = new URL(request.raw.url ?? "/", "http://localhost");
      const upstream = await plex.proxyServer(
        session.record,
        request.method,
        url.pathname,
        url.search,
      );
      reply.hijack();
      await plex.pipe(reply.raw, upstream);
    },
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url?.startsWith("/api/") === true)
      return reply.code(404).send({ error: "API route not found" });
    return reply.type("text/html").sendFile("index.html", {
      maxAge: 0,
      immutable: false,
    });
  });
  app.setErrorHandler((error: unknown, request, reply) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const stack = safeStack(error);
    const candidateStatus =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    const statusCode =
      typeof candidateStatus === "number" ? candidateStatus : 500;
    const candidateMessage =
      error instanceof Error ? error.message : "Request failed";
    request.log.error(
      {
        requestId: request.id,
        method: request.method,
        operation: logOperation(request),
        errorName,
        stack,
      },
      "request failed",
    );
    void reply.code(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : candidateMessage,
      requestId: request.id,
    });
  });
  app.addHook("onClose", async () => {
    try {
      await plex.close();
    } finally {
      sessions.close();
    }
  });
  return { app, sessions };
}
