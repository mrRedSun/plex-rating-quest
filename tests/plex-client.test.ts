import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPlexPin,
  createPlexPin,
  fetchPlexAccount,
  fetchPlexMedia,
  fetchPlexServers,
  readPendingPlexPin,
  resolvePlexServer,
  savePendingPlexPin,
} from "../lib/plex-client";
import { QuestStore } from "../store/quest-store";

describe("Plex PIN creation", () => {
  it("does not declare a media type for an empty body", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 42, code: "private-pin" })),
      );
    vi.stubGlobal("fetch", request);

    await expect(createPlexPin()).resolves.toEqual({
      id: 42,
      code: "private-pin",
    });
    const init = request.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
});

describe("resumable Plex authentication", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores a pending PIN after navigation without logging its value", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    savePendingPlexPin({ id: 42, code: "private-pin" });

    expect(readPendingPlexPin()).toEqual({ id: 42, code: "private-pin" });
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-pin");
  });

  it("removes expired pending authentication", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(700_001);
    savePendingPlexPin({ id: 42, code: "expired-pin" });

    expect(readPendingPlexPin()).toBeNull();
    expect(
      window.localStorage.getItem("plex-rating-quest-pending-pin"),
    ).toBeNull();
  });

  it("clears pending authentication after completion", () => {
    savePendingPlexPin({ id: 42, code: "private-pin" });
    clearPendingPlexPin();

    expect(readPendingPlexPin()).toBeNull();
  });

  it("loads the visible Plex username without exposing the token", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          uuid: "account-id",
          username: "movie-fan",
          title: "Movie Fan",
        }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", request);

    await expect(fetchPlexAccount("private-token")).resolves.toEqual({
      id: "account-id",
      displayName: "movie-fan",
    });
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-token");
  });

  it("orders remote, local, and relay server connections as fallbacks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              name: "Living Room",
              provides: "server",
              accessToken: "server-token",
              connections: [
                { uri: "https://local.example", local: true, relay: false },
                { uri: "https://relay.example", local: false, relay: true },
                { uri: "https://remote.example", local: false, relay: false },
              ],
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchPlexServers("account-token")).resolves.toEqual([
      expect.objectContaining({
        uri: "https://remote.example",
        connectionUris: [
          "https://remote.example",
          "https://local.example",
          "https://relay.example",
        ],
      }),
    ]);
  });

  it("falls back to the next Plex connection when the first is unreachable", async () => {
    const request = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            MediaContainer: {
              Directory: [{ key: "1", title: "Shows", type: "show" }],
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", request);

    const resolved = await resolvePlexServer({
      name: "Living Room",
      uri: "https://remote.example",
      connectionUris: ["https://remote.example", "https://local.example"],
      accessToken: "server-token",
    });

    expect(resolved.server.uri).toBe("https://local.example");
    expect(resolved.libraries).toEqual([
      { id: "1", title: "Shows", type: "show" },
    ]);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://remote.example/library/sections",
    );
    expect(request.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(request.mock.calls[1]?.[0]).toBe(
      "https://local.example/library/sections",
    );
    expect(request.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("loads account-wide history and aggregates episodes into shows", async () => {
    const request = vi.fn().mockImplementation((_input, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      const payload = body.includes("GetRatingsHub")
        ? {
            data: {
              user: {
                ratingsV2: {
                  nodes: [
                    {
                      rating: 9,
                      metadataItem: {
                        id: "show-1",
                        key: "/library/metadata/show-1",
                        title: "Old Favorite",
                        type: "SHOW",
                        year: 2012,
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          }
        : {
            data: {
              user: {
                watchHistory: {
                  nodes: [
                    {
                      id: "event-1",
                      date: "2025-01-01T00:00:00Z",
                      metadataItem: {
                        id: "episode-1",
                        key: "/library/metadata/episode-1",
                        title: "Pilot",
                        type: "EPISODE",
                        grandparent: {
                          key: "/library/metadata/show-1",
                          title: "Old Favorite",
                          publishedAt: "2012-01-01",
                          images: {
                            coverPoster: "https://images.example/poster.jpg",
                          },
                        },
                      },
                    },
                    {
                      id: "event-2",
                      date: "2026-01-01T00:00:00Z",
                      metadataItem: {
                        id: "episode-2",
                        key: "/library/metadata/episode-2",
                        title: "Finale",
                        type: "EPISODE",
                        grandparent: {
                          key: "/library/metadata/show-1",
                          title: "Old Favorite",
                          publishedAt: "2012-01-01",
                        },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          };
      return Promise.resolve(
        new Response(JSON.stringify(payload), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", request);

    const media = await fetchPlexMedia(
      {
        name: "Living Room",
        uri: "https://server.example",
        accessToken: "server-token",
      },
      [],
      { id: "account-id", token: "private-token" },
    );

    expect(media).toEqual([
      expect.objectContaining({
        id: "history:show-1",
        title: "Old Favorite",
        kind: "show",
        year: 2012,
        watchCount: 2,
        watchedAt: "2026-01-01T00:00:00Z",
        userRating: 9,
      }),
    ]);
    expect(request).toHaveBeenCalledWith(
      "/api/plex/community",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-token");
  });

  it("logs out and clears account-derived state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const store = new QuestStore();
    store.setPlexAuth({
      token: "server-session",
      accountId: "account-id",
      accountName: "movie-fan",
    });
    store.setPlexData({
      servers: [],
      selectedServer: {
        name: "Living Room",
        uri: "https://server.example",
        accessToken: "private-token",
      },
      libraries: [],
      media: [],
    });

    await store.logout();

    expect(store.accessToken).toBeNull();
    expect(store.selectedServer).toBeNull();
    expect(store.userName).toBe("Explorer");
    expect(store.stage).toBe("welcome");
  });

  it("persists Plex authorization through reloads until logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const store = new QuestStore();
    store.setPlexAuth({
      token: "server-session",
      accountId: "account-id",
      accountName: "movie-fan",
    });
    const stopPersistence = store.startPersistence();
    store.reset();
    stopPersistence();

    const restored = new QuestStore();
    expect(restored.accessToken).toBe("server-session");
    expect(restored.accountId).toBe("account-id");
    expect(restored.userName).toBe("movie-fan");
    expect(restored.stage).toBe("welcome");

    await restored.logout();
    expect(restored.accessToken).toBeNull();
    expect(restored.accountId).toBeNull();
  });

  it("removes legacy browser-stored Plex tokens during migration", () => {
    window.localStorage.setItem(
      "plex-rating-quest-session",
      JSON.stringify({
        stage: "mode",
        userName: "movie-fan",
        accountId: "account-id",
        accessToken: "legacy-private-token",
        servers: [
          {
            name: "Server",
            uri: "https://lan",
            accessToken: "server-token",
          },
        ],
        selectedServer: {
          name: "Server",
          uri: "https://lan",
          accessToken: "server-token",
        },
      }),
    );

    const migrated = new QuestStore();
    expect(migrated.accessToken).toBeNull();
    expect(migrated.accountId).toBeNull();
    expect(migrated.servers).toEqual([]);
    expect(migrated.selectedServer).toBeNull();
    expect(migrated.stage).toBe("welcome");
  });
});
