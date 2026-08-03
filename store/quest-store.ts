"use client";

import { autorun, makeAutoObservable, runInAction } from "mobx";
import { DEMO_MEDIA } from "../lib/demo-data";
import { clearDiagnostics, logEvent } from "../lib/diagnostics";
import { DEFAULT_FILTERS, filterMedia } from "../lib/quest";
import type {
  MediaItem,
  PendingRating,
  PlexLibrary,
  PlexServer,
  QuestFilters,
  QuestMode,
  QuestStage,
  TierAssignments,
  TierId,
} from "../lib/types";

const STORAGE_KEY = "plex-rating-quest-session";

interface PersistedQuestState {
  readonly stage: QuestStage;
  readonly userName: string;
  readonly accountId: string | null;
  readonly accessToken: string | null;
  readonly servers: readonly PlexServer[];
  readonly selectedServer: PlexServer | null;
  readonly isDemo: boolean;
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
  readonly tierAssignments: TierAssignments;
}

function stripArtwork(items: readonly MediaItem[]): readonly MediaItem[] {
  return items.map((item) => ({ ...item, posterUrl: null, backdropUrl: null }));
}

function readPersistedState(): Partial<PersistedQuestState> {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    return serialized === null
      ? {}
      : (JSON.parse(serialized) as Partial<PersistedQuestState>);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

export class QuestStore {
  stage: QuestStage = "welcome";
  userName = "Explorer";
  accountId: string | null = null;
  isDemo = false;
  accessToken: string | null = null;
  servers: readonly PlexServer[] = [];
  selectedServer: PlexServer | null = null;
  libraries: readonly PlexLibrary[] = [];
  media: readonly MediaItem[] = [];
  session: readonly MediaItem[] = [];
  mode: QuestMode = "watched";
  filters: QuestFilters = DEFAULT_FILTERS;
  index = 0;
  ratings: Readonly<Record<string, PendingRating>> = {};
  skips = 0;
  startedAt: string | null = null;
  isPaused = false;
  tierAssignments: TierAssignments = {};

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
    if (typeof window !== "undefined")
      Object.assign(this, readPersistedState());
  }

  startPersistence(): () => void {
    return autorun(() => {
      const persisted: PersistedQuestState = {
        stage: this.stage,
        userName: this.userName,
        accountId: this.accountId,
        accessToken: this.accessToken,
        servers: this.servers,
        selectedServer: this.selectedServer,
        isDemo: this.isDemo,
        libraries: this.libraries,
        media: stripArtwork(this.media),
        session: stripArtwork(this.session),
        mode: this.mode,
        filters: this.filters,
        index: this.index,
        ratings: this.ratings,
        skips: this.skips,
        startedAt: this.startedAt,
        isPaused: this.isPaused,
        tierAssignments: this.tierAssignments,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    });
  }

  setStage(stage: QuestStage): void {
    logEvent("quest.stage.changed", { from: this.stage, to: stage });
    this.stage = stage;
  }

  startDemo(): void {
    logEvent("quest.demo.started", { mediaCount: DEMO_MEDIA.length });
    this.resetQuestState();
    this.isDemo = true;
    if (this.accessToken === null) this.userName = "Roman";
    this.media = DEMO_MEDIA;
    this.libraries = [
      { id: "movies", title: "Movies", type: "movie" },
      { id: "shows", title: "Shows", type: "show" },
    ];
    this.stage = "mode";
  }

  setPlexAuth(auth: {
    readonly token: string;
    readonly accountId: string;
    readonly accountName: string;
  }): void {
    logEvent("auth.session.saved");
    this.accessToken = auth.token;
    this.accountId = auth.accountId;
    this.userName = auth.accountName;
    this.isDemo = false;
  }

  setPlexData(connection: {
    readonly servers: readonly PlexServer[];
    readonly selectedServer: PlexServer;
    readonly libraries: readonly PlexLibrary[];
    readonly media: readonly MediaItem[];
  }): void {
    logEvent("quest.plex.ready", {
      serverCount: connection.servers.length,
      libraryCount: connection.libraries.length,
      mediaCount: connection.media.length,
    });
    this.servers = connection.servers;
    this.selectedServer = connection.selectedServer;
    this.libraries = connection.libraries;
    this.media = connection.media;
    this.stage = "mode";
    this.isDemo = false;
  }

  setMode(mode: QuestMode): void {
    logEvent("quest.mode.selected", { mode });
    this.mode = mode;
    if (mode === "watched")
      this.filters = {
        ...this.filters,
        minimumWatchCount: Math.max(1, this.filters.minimumWatchCount),
      };
  }

  setFilters(filters: QuestFilters): void {
    logEvent("quest.filters.updated", {
      minimumWatchCount: filters.minimumWatchCount,
      minimumYear: filters.minimumYear,
      maximumYear: filters.maximumYear,
      hideDocumentaries: filters.hideDocumentaries,
      hideKids: filters.hideKids,
    });
    this.filters = filters;
  }

  createSession(): void {
    this.session = filterMedia(this.media, this.mode, this.filters);
    logEvent("quest.session.created", {
      mode: this.mode,
      mediaCount: this.session.length,
    });
    this.index = 0;
    this.ratings = {};
    this.skips = 0;
    this.startedAt = new Date().toISOString();
    this.stage = "rating";
  }

  rateCurrent(value: number | null): void {
    const item = this.session[this.index];
    if (item === undefined) return;
    const atEnd = this.index >= this.session.length - 1;
    const rating: PendingRating = {
      mediaId: item.id,
      value,
      previousValue: item.userRating,
      updatedAt: new Date().toISOString(),
    };
    logEvent(
      "quest.rating.queued",
      {
        position: this.index + 1,
        rating: value,
        replacedExisting: item.userRating !== null,
        atEnd,
      },
      "debug",
    );
    this.ratings = { ...this.ratings, [item.id]: rating };
    if (atEnd) this.stage = "review";
    else this.index += 1;
  }

  skipCurrent(): void {
    const atEnd = this.index >= this.session.length - 1;
    logEvent(
      "quest.item.skipped",
      { position: this.index + 1, atEnd },
      "debug",
    );
    this.skips += 1;
    if (atEnd) this.stage = "review";
    else this.index += 1;
  }

  previous(): void {
    logEvent("quest.navigation.previous", { from: this.index + 1 }, "debug");
    this.index = Math.max(0, this.index - 1);
  }

  next(): void {
    logEvent("quest.navigation.next", { from: this.index + 1 }, "debug");
    this.index = Math.min(this.session.length - 1, this.index + 1);
  }

  togglePause(): void {
    logEvent(this.isPaused ? "quest.resumed" : "quest.paused", {
      position: this.index + 1,
    });
    this.isPaused = !this.isPaused;
  }

  updateRating(mediaId: string, value: number | null): void {
    const item = this.media.find((candidate) => candidate.id === mediaId);
    if (item === undefined) {
      logEvent("quest.review.update.missing", {}, "warn");
      return;
    }
    logEvent("quest.review.updated", { rating: value }, "debug");
    this.ratings = {
      ...this.ratings,
      [mediaId]: {
        mediaId,
        value,
        previousValue: item.userRating,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  assignTier(mediaId: string, tier: TierId): void {
    this.tierAssignments = { ...this.tierAssignments, [mediaId]: tier };
    logEvent("tier_list.assigned", { tier }, "debug");
  }

  clearTierList(): void {
    this.tierAssignments = {};
    logEvent("tier_list.cleared");
  }

  reset(): void {
    clearDiagnostics();
    logEvent("quest.reset");
    this.resetQuestState();
  }

  logout(): void {
    logEvent("auth.logout");
    this.resetQuestState();
    this.accountId = null;
    this.accessToken = null;
    this.userName = "Explorer";
    this.servers = [];
    this.selectedServer = null;
    localStorage.removeItem("plex-rating-quest-pending-pin");
  }

  private resetQuestState(): void {
    runInAction(() => {
      this.stage = "welcome";
      this.isDemo = false;
      this.libraries = [];
      this.media = [];
      this.session = [];
      this.mode = "watched";
      this.filters = DEFAULT_FILTERS;
      this.index = 0;
      this.ratings = {};
      this.skips = 0;
      this.startedAt = null;
      this.isPaused = false;
      this.tierAssignments = {};
    });
  }
}

export const questStore = new QuestStore();

export function useQuestStore<Selection>(
  selector: (store: QuestStore) => Selection,
): Selection {
  return selector(questStore);
}
