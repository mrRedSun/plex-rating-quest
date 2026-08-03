"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_MEDIA } from "../lib/demo-data";
import { clearDiagnostics, logEvent } from "../lib/diagnostics";
import { DEFAULT_FILTERS, filterMedia } from "../lib/quest";
import type { MediaItem, PendingRating, PlexLibrary, PlexServer, QuestFilters, QuestMode, QuestStage } from "../lib/types";

interface QuestState {
  readonly stage: QuestStage;
  readonly userName: string;
  readonly isDemo: boolean;
  readonly accessToken: string | null;
  readonly servers: readonly PlexServer[];
  readonly selectedServer: PlexServer | null;
  readonly libraries: readonly PlexLibrary[];
  readonly media: readonly MediaItem[];
  readonly session: readonly MediaItem[];
  readonly mode: QuestMode;
  readonly filters: QuestFilters;
  readonly index: number;
  readonly ratings: Readonly<Record<string, PendingRating>>;
  readonly skips: number;
  readonly startedAt: string | null;
  readonly isPaused: boolean;
  setStage(stage: QuestStage): void;
  startDemo(): void;
  setPlexData(token: string, servers: readonly PlexServer[], selectedServer: PlexServer, libraries: readonly PlexLibrary[], media: readonly MediaItem[]): void;
  setMode(mode: QuestMode): void;
  setFilters(filters: QuestFilters): void;
  createSession(): void;
  rateCurrent(value: number | null): void;
  skipCurrent(): void;
  previous(): void;
  next(): void;
  togglePause(): void;
  updateRating(mediaId: string, value: number | null): void;
  reset(): void;
}

const initialState = {
  stage: "welcome" as const,
  userName: "Explorer",
  isDemo: false,
  accessToken: null,
  servers: [] as readonly PlexServer[],
  selectedServer: null,
  libraries: [] as readonly PlexLibrary[],
  media: [] as readonly MediaItem[],
  session: [] as readonly MediaItem[],
  mode: "watched" as const,
  filters: DEFAULT_FILTERS,
  index: 0,
  ratings: {} as Readonly<Record<string, PendingRating>>,
  skips: 0,
  startedAt: null,
  isPaused: false,
};

export const useQuestStore = create<QuestState>()(persist((set, get) => ({
  ...initialState,
  setStage: (stage) => {
    logEvent("quest.stage.changed", { from: get().stage, to: stage });
    set({ stage });
  },
  startDemo: () => {
    logEvent("quest.demo.started", { mediaCount: DEMO_MEDIA.length });
    set({ ...initialState, isDemo: true, userName: "Roman", media: DEMO_MEDIA, libraries: [{ id: "movies", title: "Movies", type: "movie" }, { id: "shows", title: "Shows", type: "show" }], stage: "mode" });
  },
  setPlexData: (accessToken, servers, selectedServer, libraries, media) => {
    logEvent("quest.plex.ready", { serverCount: servers.length, libraryCount: libraries.length, mediaCount: media.length });
    set({ accessToken, servers, selectedServer, libraries, media, userName: "Plex member", stage: "mode", isDemo: false });
  },
  setMode: (mode) => {
    logEvent("quest.mode.selected", { mode });
    set((state) => ({ mode, filters: mode === "watched" ? { ...state.filters, minimumWatchCount: Math.max(1, state.filters.minimumWatchCount) } : state.filters }));
  },
  setFilters: (filters) => {
    logEvent("quest.filters.updated", { minimumWatchCount: filters.minimumWatchCount, minimumYear: filters.minimumYear, maximumYear: filters.maximumYear, hideDocumentaries: filters.hideDocumentaries, hideKids: filters.hideKids });
    set({ filters });
  },
  createSession: () => {
    const state = get();
    const session = filterMedia(state.media, state.mode, state.filters);
    logEvent("quest.session.created", { mode: state.mode, mediaCount: session.length });
    set({ session, index: 0, ratings: {}, skips: 0, startedAt: new Date().toISOString(), stage: "rating" });
  },
  rateCurrent: (value) => {
    const state = get();
    const item = state.session[state.index];
    if (item === undefined) return;
    const rating: PendingRating = { mediaId: item.id, value, previousValue: item.userRating, updatedAt: new Date().toISOString() };
    const atEnd = state.index >= state.session.length - 1;
    logEvent("quest.rating.queued", { position: state.index + 1, rating: value, replacedExisting: item.userRating !== null, atEnd }, "debug");
    set({ ratings: { ...state.ratings, [item.id]: rating }, index: atEnd ? state.index : state.index + 1, stage: atEnd ? "review" : "rating" });
  },
  skipCurrent: () => {
    const state = get();
    const atEnd = state.index >= state.session.length - 1;
    logEvent("quest.item.skipped", { position: state.index + 1, atEnd }, "debug");
    set({ skips: state.skips + 1, index: atEnd ? state.index : state.index + 1, stage: atEnd ? "review" : "rating" });
  },
  previous: () => set((state) => {
    logEvent("quest.navigation.previous", { from: state.index + 1 }, "debug");
    return { index: Math.max(0, state.index - 1) };
  }),
  next: () => set((state) => {
    logEvent("quest.navigation.next", { from: state.index + 1 }, "debug");
    return { index: Math.min(state.session.length - 1, state.index + 1) };
  }),
  togglePause: () => set((state) => {
    logEvent(state.isPaused ? "quest.resumed" : "quest.paused", { position: state.index + 1 });
    return { isPaused: !state.isPaused };
  }),
  updateRating: (mediaId, value) => set((state) => {
    const item = state.media.find((candidate) => candidate.id === mediaId);
    if (item === undefined) {
      logEvent("quest.review.update.missing", {}, "warn");
      return {};
    }
    logEvent("quest.review.updated", { rating: value }, "debug");
    return { ratings: { ...state.ratings, [mediaId]: { mediaId, value, previousValue: item.userRating, updatedAt: new Date().toISOString() } } };
  }),
  reset: () => {
    clearDiagnostics();
    logEvent("quest.reset");
    set(initialState);
  },
}), {
  name: "plex-rating-quest-session",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    ...state,
    accessToken: null,
    servers: [],
    selectedServer: null,
    media: state.media.map((item) => ({ ...item, posterUrl: null, backdropUrl: null })),
    session: state.session.map((item) => ({ ...item, posterUrl: null, backdropUrl: null })),
  }),
}));
