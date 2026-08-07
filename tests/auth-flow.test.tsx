import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlexRatingQuest } from "../app/components/PlexRatingQuest";
import * as plexClient from "../lib/plex-client";
import type { MediaItem, PlexServer } from "../lib/types";
import { questStore } from "../store/quest-store";

vi.mock("../lib/plex-client", async (importOriginal) => ({
  ...(await importOriginal<typeof plexClient>()),
  fetchPlexLibraries: vi.fn(),
  fetchPlexMedia: vi.fn(),
  fetchPlexServers: vi.fn(),
  resolvePlexServer: vi.fn(),
  destroyPlexSession: vi.fn().mockResolvedValue(undefined),
  restorePlexSession: vi.fn().mockResolvedValue(null),
}));

const SERVER: PlexServer = {
  name: "Living Room",
  uri: "https://server.example",
  accessToken: "server-token",
};

const RATED_SHOW: MediaItem = {
  id: "show-1",
  title: "Excellent Show",
  year: 2020,
  kind: "show",
  runtimeMinutes: 45,
  genres: ["Drama"],
  watchCount: 4,
  watchedAt: "2026-01-01T00:00:00Z",
  posterUrl: null,
  backdropUrl: null,
  audienceRating: null,
  criticRating: null,
  userRating: 9,
  libraryId: "shows",
};

function authorize(): void {
  questStore.setPlexAuth({
    token: "account-token",
    accountId: "account-id",
    accountName: "movie-fan",
  });
}

describe("durable separated Plex flows", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await questStore.logout();
    vi.clearAllMocks();
    vi.mocked(plexClient.resolvePlexServer).mockImplementation((server) =>
      Promise.resolve({
        server,
        libraries: [{ id: "shows", title: "Shows", type: "show" }],
      }),
    );
    window.history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    cleanup();
    await questStore.logout();
  });

  it("keeps authorization when a separate data pull fails", async () => {
    authorize();
    vi.mocked(plexClient.fetchPlexServers).mockRejectedValue(
      new Error("Server temporarily unavailable"),
    );

    render(<PlexRatingQuest />);
    fireEvent.click(screen.getByRole("button", { name: /load my plex data/i }));

    expect(
      await screen.findByText("Server temporarily unavailable"),
    ).toBeInTheDocument();
    expect(questStore.accessToken).toBe("account-token");
    expect(questStore.accountId).toBe("account-id");
    expect(
      screen.getByRole("button", { name: /load my plex data/i }),
    ).toBeEnabled();
  });

  it("loads data from an already-authorized session without another PIN", async () => {
    authorize();
    vi.mocked(plexClient.fetchPlexServers).mockResolvedValue([SERVER]);
    vi.mocked(plexClient.fetchPlexLibraries).mockResolvedValue([
      { id: "shows", title: "Shows", type: "show" },
    ]);
    vi.mocked(plexClient.fetchPlexMedia).mockResolvedValue([RATED_SHOW]);

    render(<PlexRatingQuest />);
    fireEvent.click(screen.getByRole("button", { name: /load my plex data/i }));

    expect(await screen.findByText("Choose your quest")).toBeInTheDocument();
    expect(plexClient.fetchPlexMedia).toHaveBeenCalledWith(
      SERVER,
      [{ id: "shows", title: "Shows", type: "show" }],
      { id: "account-id", token: "account-token" },
    );
    expect(questStore.stage).toBe("mode");
  });

  it("offers accessible logout and clears the durable authorization", async () => {
    authorize();
    render(<PlexRatingQuest />);

    fireEvent.click(screen.getByRole("button", { name: "Log out movie-fan" }));
    await waitFor(() => expect(questStore.accessToken).toBeNull());
    expect(questStore.accountId).toBeNull();
    expect(
      screen.getByRole("button", { name: /continue with plex/i }),
    ).toBeInTheDocument();
  });

  it("copies only rated shows as an AI recommendation prompt", async () => {
    const writeText = vi
      .fn<(value: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    authorize();
    questStore.setPlexData({
      servers: [SERVER],
      selectedServer: SERVER,
      libraries: [],
      media: [
        RATED_SHOW,
        { ...RATED_SHOW, id: "movie-1", title: "Rated Movie", kind: "movie" },
        {
          ...RATED_SHOW,
          id: "show-2",
          title: "Unrated Show",
          userRating: null,
        },
      ],
    });
    questStore.setStage("dashboard");

    render(<PlexRatingQuest />);
    fireEvent.click(screen.getByRole("button", { name: /copy shows for ai/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const prompt = vi.mocked(writeText).mock.calls[0]?.[0];
    expect(prompt).toContain("Excellent Show (2020): 4.5/5");
    expect(prompt).not.toContain("Rated Movie");
    expect(prompt).not.toContain("Unrated Show");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("uses the brand as a home link to the loaded app selection", () => {
    authorize();
    questStore.setPlexData({
      servers: [SERVER],
      selectedServer: SERVER,
      libraries: [],
      media: [RATED_SHOW],
    });
    questStore.setStage("dashboard");
    render(<PlexRatingQuest />);

    const home = screen.getByRole("link", {
      name: "Plex Rating Quest home",
    });
    expect(home).toHaveAttribute("href", "/quests");
    fireEvent.click(home);

    expect(questStore.stage).toBe("mode");
    expect(screen.getByText("Choose your quest")).toBeInTheDocument();
  });

  it("uses the brand as a home link to login before data is loaded", () => {
    authorize();
    render(<PlexRatingQuest />);

    const home = screen.getByRole("link", {
      name: "Plex Rating Quest home",
    });
    expect(home).toHaveAttribute("href", "/");
    fireEvent.click(home);

    expect(questStore.stage).toBe("welcome");
    expect(
      screen.getByRole("button", { name: /load my plex data/i }),
    ).toBeInTheDocument();
  });

  it("rehydrates stripped artwork after restoring a persisted rating session", async () => {
    authorize();
    const stripped = { ...RATED_SHOW, posterUrl: null, backdropUrl: null };
    const refreshed = {
      ...RATED_SHOW,
      posterUrl: "https://images.example/poster.jpg",
      backdropUrl: "https://images.example/backdrop.jpg",
    };
    questStore.setPlexData({
      servers: [SERVER],
      selectedServer: SERVER,
      libraries: [{ id: "shows", title: "Shows", type: "show" }],
      media: [stripped],
    });
    questStore.createSession();
    vi.mocked(plexClient.fetchPlexLibraries).mockResolvedValue([
      { id: "shows", title: "Shows", type: "show" },
    ]);
    vi.mocked(plexClient.fetchPlexMedia).mockResolvedValue([refreshed]);

    render(<PlexRatingQuest />);

    await waitFor(() =>
      expect(questStore.session[0]?.posterUrl).toBe(
        "https://images.example/poster.jpg",
      ),
    );
    expect(questStore.media[0]?.backdropUrl).toBe(
      "https://images.example/backdrop.jpg",
    );
    expect(questStore.stage).toBe("rating");
    expect(plexClient.fetchPlexMedia).toHaveBeenCalledWith(
      SERVER,
      [{ id: "shows", title: "Shows", type: "show" }],
      { id: "account-id", token: "account-token" },
    );
  });
});
