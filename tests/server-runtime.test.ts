import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const children: ChildProcess[] = [];
const directories: string[] = [];

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "--project", "tsconfig.server.json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`Server compilation failed: ${result.stderr}`);
});

afterEach(async () => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function waitForHealth(origin: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.ok) return response;
    } catch (reason) {
      lastError = reason;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Test server did not become healthy", { cause: lastError });
}

describe("protected backend runtime", () => {
  it("fails closed without a sufficiently strong session secret", () => {
    const result = spawnSync(process.execPath, ["server-dist/server.js"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, SESSION_SECRET: "short" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "SESSION_SECRET must contain at least 32 characters",
    );
  });

  it("serves health and rejects cross-origin session creation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "plex-rating-quest-test-"));
    directories.push(directory);
    const port = 20_000 + Math.floor(Math.random() * 10_000);
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server-dist/server.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATA_DIRECTORY: directory,
        PORT: String(port),
        SESSION_SECRET: "runtime-test-secret-that-is-longer-than-32-characters",
        STATIC_DIRECTORY: join(process.cwd(), "public"),
      },
      stdio: "ignore",
    });
    children.push(child);

    const health = await waitForHealth(origin);
    expect(await health.text()).toBe("ok\n");
    expect(health.headers.get("content-security-policy")).toContain(
      "connect-src 'self'",
    );

    const rejected = await fetch(`${origin}/api/auth/pin`, {
      method: "POST",
      headers: { Origin: "https://attacker.invalid" },
    });
    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toEqual({
      error: "Invalid request origin",
    });
  });
});
