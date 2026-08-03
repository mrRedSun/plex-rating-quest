import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPlexPin,
  fetchPlexAccount,
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
        JSON.stringify({ username: "movie-fan", title: "Movie Fan" }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", request);

    await expect(fetchPlexAccount("private-token")).resolves.toEqual({
      displayName: "movie-fan",
    });
    expect(
      window.sessionStorage.getItem("plex-rating-quest-diagnostics"),
    ).not.toContain("private-token");
  });

  it("logs out and clears account-derived state", () => {
    const store = new QuestStore();
    store.setPlexData({
      token: "private-token",
      accountName: "movie-fan",
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
});
