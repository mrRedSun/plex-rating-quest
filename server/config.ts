import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AppConfig {
  readonly port: number;
  readonly dataDirectory: string;
  readonly databaseFile: string;
  readonly sessionSecret: string;
  readonly cookieSecure: boolean;
  readonly staticDirectory: string;
  readonly appVersion: string;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly publicOrigin: string;
  readonly allowedPrivatePlexHosts: ReadonlySet<string>;
}

function validatedLogLevel(
  value: string | undefined,
): "debug" | "info" | "warn" | "error" {
  const level = value ?? "info";
  if (!["debug", "info", "warn", "error"].includes(level))
    throw new Error("LOG_LEVEL must be debug, info, warn, or error");
  return level as "debug" | "info" | "warn" | "error";
}

function validatedPort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "8080", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer from 1 through 65535");
  return port;
}

function validatedOrigin(value: string | undefined): string {
  const origin = new URL(value ?? "");
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("PUBLIC_ORIGIN must be an absolute HTTP(S) origin");
  if (origin.pathname !== "/" || origin.search !== "")
    throw new Error("PUBLIC_ORIGIN must not contain a path or query");
  return origin.origin;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const port = validatedPort(environment.PORT);
  const dataDirectory = environment.DATA_DIRECTORY ?? "/data";
  const sessionSecret =
    environment.SESSION_SECRET ??
    readFileSync(
      environment.SESSION_SECRET_FILE ?? "/run/secrets/session_secret",
      "utf8",
    ).trim();
  if (sessionSecret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  const publicOrigin = validatedOrigin(environment.PUBLIC_ORIGIN);
  return {
    port,
    dataDirectory,
    databaseFile: join(dataDirectory, "sessions.sqlite"),
    sessionSecret,
    cookieSecure: environment.COOKIE_SECURE !== "false",
    staticDirectory: environment.STATIC_DIRECTORY ?? "/app/dist",
    appVersion: environment.APP_VERSION ?? "development",
    logLevel: validatedLogLevel(environment.LOG_LEVEL),
    publicOrigin,
    allowedPrivatePlexHosts: new Set(
      (environment.PLEX_ALLOWED_PRIVATE_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter((host) => host.length > 0),
    ),
  };
}
