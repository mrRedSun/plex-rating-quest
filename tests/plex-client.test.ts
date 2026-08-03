import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPlexPin,
  fetchPlexAccount,
  fetchPlexMedia,
  readPendingPlexPin,
  savePendingPlexPin,
} from "../lib/plex-client";
import { QuestStore } from "../store/quest-store";

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
      "https://community.plex.tv/api",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-token");
  });

  it("logs out and clears account-derived state", () => {
    const store = new QuestStore();
    store.setPlexAuth({
      token: "private-token",
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

    store.logout();

    expect(store.accessToken).toBeNull();
    expect(store.selectedServer).toBeNull();
    expect(store.userName).toBe("Explorer");
    expect(store.stage).toBe("welcome");
  });

  it("persists Plex authorization through reloads until logout", () => {
    const store = new QuestStore();
    store.setPlexAuth({
      token: "private-token",
      accountId: "account-id",
      accountName: "movie-fan",
    });
    const stopPersistence = store.startPersistence();
    store.reset();
    stopPersistence();

    const restored = new QuestStore();
    expect(restored.accessToken).toBe("private-token");
    expect(restored.accountId).toBe("account-id");
    expect(restored.userName).toBe("movie-fan");
    expect(restored.stage).toBe("welcome");

    restored.logout();
    expect(restored.accessToken).toBeNull();
    expect(restored.accountId).toBeNull();
  });
});
