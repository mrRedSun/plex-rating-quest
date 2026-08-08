import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinnedLookup, PlexGateway } from "../server/plex-gateway";
import type { AppConfig } from "../server/config";
import type { SessionRecord } from "../server/domain";

const CONFIG: AppConfig = {
  port: 8080,
  dataDirectory: "/tmp/test",
  databaseFile: "/tmp/test/sessions.sqlite",
  sessionSecret: "test-secret-that-is-definitely-at-least-32-characters",
  cookieSecure: true,
  staticDirectory: "/tmp/static",
  appVersion: "test",
  logLevel: "error",
  publicOrigin: "https://quest.example",
  allowedPrivatePlexHosts: new Set(),
};

function record(uri = "https://plex.example:32400"): SessionRecord {
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    token: "account-secret",
    servers: {
      abcdef0123456789: [{ uri, token: "server-secret" }],
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("pinned DNS lookup", () => {
  it("returns an address array when Undici requests all addresses", async () => {
    const lookup = createPinnedLookup(() =>
      Promise.resolve({ address: "203.0.113.10", family: 4 }),
    );

    await expect(
      new Promise((resolve, reject) =>
        lookup("plex.tv", { all: true }, (error, addresses) =>
          error === null ? resolve(addresses) : reject(error),
        ),
      ),
    ).resolves.toEqual([{ address: "203.0.113.10", family: 4 }]);
  });
});

describe("Plex gateway trust boundaries", () => {
  it.each([
    "//attacker.example/collect",
    "/%2Fattacker.example/collect",
    "/%5C%5Cattacker.example/collect",
    "/library/../private",
  ])("rejects authority and traversal path %s", async (path) => {
    const request = { method: "GET" } as never;
    const outbound = vi.fn();
    vi.stubGlobal("fetch", outbound);

    await expect(
      new PlexGateway(CONFIG).proxyServer(
        record(),
        request,
        `/api/plex/server/abcdef0123456789/0${path}`,
        "",
      ),
    ).rejects.toThrow();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("projects account data and never returns upstream secrets", async () => {
    const outbound = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uuid: "account-id",
          username: "viewer",
          title: "Viewer",
          authToken: "must-not-leak",
          email: "private@example.com",
          subscription: { active: true },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", outbound);
    const account = await new PlexGateway(CONFIG, outbound as never).account(
      record(),
    );

    expect(account).toEqual({
      uuid: "account-id",
      username: "viewer",
      title: "Viewer",
    });
    expect(JSON.stringify(account)).not.toContain("must-not-leak");
    expect(outbound).toHaveBeenCalledWith(
      "https://plex.tv/api/v2/user",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it.each([
    "http://127.0.0.1:32400",
    "http://169.254.169.254:32400",
    "http://10.0.0.5:32400",
    "http://192.168.1.10:32400",
  ])("blocks non-allowlisted private destination %s", async (uri) => {
    const operation = new PlexGateway(CONFIG).proxyServer(
      record(uri),
      { method: "GET" } as never,
      "/api/plex/server/abcdef0123456789/0/library/sections",
      "",
    );
    await expect(operation).rejects.toThrow(
      /not operator-allowlisted|not allowed/,
    );
  });
});
