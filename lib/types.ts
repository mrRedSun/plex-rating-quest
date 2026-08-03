export const QUEST_MODES = [
  "watched",
  "unrated",
  "everything",
  "movies",
  "shows",
] as const;
export type QuestMode = (typeof QUEST_MODES)[number];
export type MediaKind = "movie" | "show";

export interface MediaItem {
  readonly id: string;
  readonly title: string;
  readonly year: number;
  readonly kind: MediaKind;
  readonly runtimeMinutes: number;
  readonly genres: readonly string[];
  readonly watchCount: number;
  readonly watchedAt: string;
  readonly posterUrl: string | null;
  readonly backdropUrl: string | null;
  readonly audienceRating: number | null;
  readonly criticRating: number | null;
  readonly userRating: number | null;
  readonly libraryId: string;
}

export interface PendingRating {
  readonly mediaId: string;
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly updatedAt: string;
}

export interface QuestFilters {
  readonly minimumWatchCount: number;
  readonly minimumYear: number;
  readonly maximumYear: number;
  readonly genre: string;
  readonly libraryId: string;
  readonly hideDocumentaries: boolean;
  readonly hideKids: boolean;
}

export type QuestStage =
  | "welcome"
  | "mode"
  | "filters"
  | "rating"
  | "review"
  | "applying"
  | "complete";

export interface PlexServer {
  readonly name: string;
  readonly uri: string;
  readonly accessToken: string;
}

export interface PlexLibrary {
  readonly id: string;
  readonly title: string;
  readonly type: MediaKind;
}

export interface QuestStats {
  readonly count: number;
  readonly average: number;
  readonly fiveStarCount: number;
  readonly skips: number;
  readonly rerated: number;
  readonly topGenre: string;
}
