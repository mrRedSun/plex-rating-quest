"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_MEDIA } from "../lib/demo-data";
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
  setStage: (stage) => set({ stage }),
  startDemo: () => set({ ...initialState, isDemo: true, userName: "Roman", media: DEMO_MEDIA, libraries: [{ id: "movies", title: "Movies", type: "movie" }, { id: "shows", title: "Shows", type: "show" }], stage: "mode" }),
  setPlexData: (accessToken, servers, selectedServer, libraries, media) => set({ accessToken, servers, selectedServer, libraries, media, userName: "Plex member", stage: "mode", isDemo: false }),
  setMode: (mode) => set({ mode }),
  setFilters: (filters) => set({ filters }),
  createSession: () => {
    const state = get();
    set({ session: filterMedia(state.media, state.mode, state.filters), index: 0, ratings: {}, skips: 0, startedAt: new Date().toISOString(), stage: "rating" });
  },
  rateCurrent: (value) => {
    const state = get();
    const item = state.session[state.index];
    if (item === undefined) return;
    const rating: PendingRating = { mediaId: item.id, value, previousValue: item.userRating, updatedAt: new Date().toISOString() };
    const atEnd = state.index >= state.session.length - 1;
    set({ ratings: { ...state.ratings, [item.id]: rating }, index: atEnd ? state.index : state.index + 1, stage: atEnd ? "review" : "rating" });
  },
  skipCurrent: () => {
    const state = get();
    const atEnd = state.index >= state.session.length - 1;
    set({ skips: state.skips + 1, index: atEnd ? state.index : state.index + 1, stage: atEnd ? "review" : "rating" });
  },
  previous: () => set((state) => ({ index: Math.max(0, state.index - 1) })),
  next: () => set((state) => ({ index: Math.min(state.session.length - 1, state.index + 1) })),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  updateRating: (mediaId, value) => set((state) => {
    const item = state.media.find((candidate) => candidate.id === mediaId);
    return item === undefined ? {} : { ratings: { ...state.ratings, [mediaId]: { mediaId, value, previousValue: item.userRating, updatedAt: new Date().toISOString() } } };
  }),
  reset: () => set(initialState),
}), {
  name: "plex-rating-quest-session",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ ...state, accessToken: null, servers: [], selectedServer: null }),
}));
