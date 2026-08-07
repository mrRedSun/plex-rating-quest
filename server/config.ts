import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface AppConfig {
  readonly port: number;
  readonly dataDirectory: string;
  readonly sessionFile: string;
  readonly sessionSecret: string;
  readonly cookieSecure: boolean;
  readonly staticDirectory: string;
  readonly appVersion: string;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const port = Number.parseInt(environment.PORT ?? "8080", 10);
  const dataDirectory = environment.DATA_DIRECTORY ?? "/data";
  const sessionSecret =
    environment.SESSION_SECRET ??
    readFileSync(
      environment.SESSION_SECRET_FILE ?? "/run/secrets/session_secret",
      "utf8",
    ).trim();
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer from 1 through 65535");
  if (sessionSecret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  return {
    port,
    dataDirectory,
    sessionFile: join(dataDirectory, "sessions.enc"),
    sessionSecret,
    cookieSecure: environment.COOKIE_SECURE !== "false",
    staticDirectory: environment.STATIC_DIRECTORY ?? "/app/dist",
    appVersion: environment.APP_VERSION ?? "development",
  };
}
