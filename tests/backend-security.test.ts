import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../server/app";
import type { AppConfig } from "../server/config";
import { SessionRepository } from "../server/session-repository";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function testConfig(): Promise<AppConfig> {
  const dataDirectory = await mkdtemp(join(tmpdir(), "plex-quest-backend-"));
  directories.push(dataDirectory);
  return {
    port: 8080,
    dataDirectory,
    databaseFile: join(dataDirectory, "sessions.sqlite"),
    sessionSecret: "test-secret-that-is-deliberately-longer-than-32-characters",
    cookieSecure: true,
    staticDirectory: join(process.cwd(), "public"),
    appVersion: "test",
    logLevel: "info",
    publicOrigin: "https://quest.example.test",
    allowedPrivatePlexHosts: new Set(),
  };
}

describe("backend security boundaries", () => {
  it("encrypts session payloads, hashes IDs, and invalidates rotated IDs", async () => {
    const config = await testConfig();
    const repository = new SessionRepository(config);
    await repository.initialize();
    const original = repository.create();
    original.record.token = "super-secret-plex-token";
    original.record.account = {
      uuid: "private-account-id",
      username: "private-user",
      title: "Private User",
    };
    repository.persist(original);

    const rotated = repository.rotate(original);
    expect(repository.get(original.id)).toBeNull();
    expect(repository.get(rotated.id)?.record.token).toBe(
      "super-secret-plex-token",
    );
    repository.close();

    const databaseBytes = await readFile(config.databaseFile);
    const databaseText = databaseBytes.toString("latin1");
    expect(databaseText).not.toContain("super-secret-plex-token");
    expect(databaseText).not.toContain("private-user");
    expect(databaseText).not.toContain(original.id);
    expect(databaseText).not.toContain(rotated.id);
  });

  it("rejects ciphertext moved to a different session row", async () => {
    const config = await testConfig();
    const repository = new SessionRepository(config);
    await repository.initialize();
    const first = repository.create();
    const second = repository.create();
    first.record.token = "first-token";
    second.record.token = "second-token";
    repository.persist(first);
    repository.persist(second);
    repository.close();

    const database = new DatabaseSync(config.databaseFile);
    const firstHash = createHash("sha256").update(first.id).digest("hex");
    const secondRow = database
      .prepare("SELECT payload FROM sessions WHERE id_hash != ?")
      .get(firstHash) as { readonly payload: Uint8Array };
    database
      .prepare("UPDATE sessions SET payload = ? WHERE id_hash = ?")
      .run(secondRow.payload, firstHash);
    database.close();

    const reopened = new SessionRepository(config);
    await reopened.initialize();
    expect(() => reopened.get(first.id)).toThrow();
    expect(reopened.get(second.id)?.record.token).toBe("second-token");
    reopened.close();
  });

  it("rejects unauthenticated session timestamp changes", async () => {
    const config = await testConfig();
    const repository = new SessionRepository(config);
    await repository.initialize();
    const session = repository.create();
    repository.close();

    const database = new DatabaseSync(config.databaseFile);
    database.exec("UPDATE sessions SET updated_at = updated_at + 1000");
    database.close();

    const reopened = new SessionRepository(config);
    await reopened.initialize();
    expect(() => reopened.get(session.id)).toThrow();
    reopened.close();
  });

  it("returns correlated errors without logging secret-bearing messages", async () => {
    const config = await testConfig();
    let output = "";
    const stream = new Writable({
      write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ) {
        output += chunk.toString("utf8");
        callback();
      },
    });
    const { app } = await buildApp(config, { logStream: stream });
    const secret = "PlexToken-do-not-log-this";
    app.get("/__error-test", () => {
      throw new Error(`upstream failed with ${secret}`);
    });

    const response = await app.inject({ method: "GET", url: "/__error-test" });
    expect(response.statusCode).toBe(500);
    const body = response.json<{ error: string; requestId: string }>();
    expect(body.error).toBe("Internal server error");
    expect(body.requestId).toBeTruthy();
    expect(output).toContain(body.requestId);
    expect(output).toContain("request failed");
    expect(output).not.toContain(secret);
    expect(output).not.toContain("upstream failed with");

    const mediaId = "private-media-rating-key-847291";
    await app.inject({
      method: "GET",
      url: `/api/plex/server/server-id/0/library/metadata/${mediaId}/thumb`,
    });
    expect(output).toContain("/api/plex/server/:serverId/:connectionIndex/*");
    expect(output).not.toContain(mediaId);
    await app.close();
  });

  it("uses hardened cookies and rejects foreign mutation origins", async () => {
    const config = await testConfig();
    const { app, sessions } = await buildApp(config);
    const session = sessions.create();

    const rejected = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: "https://attacker.invalid",
        cookie: `plex_rating_session=${session.id}`,
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(sessions.get(session.id)).not.toBeNull();

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: config.publicOrigin,
        cookie: `plex_rating_session=${session.id}`,
      },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain("HttpOnly");
    expect(logout.headers["set-cookie"]).toContain("Secure");
    expect(logout.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(sessions.get(session.id)).toBeNull();
    await app.close();
  });
});
