import type {
  MediaItem,
  PendingRating,
  QuestFilters,
  QuestMode,
  QuestStats,
} from "./types";

export const DEFAULT_FILTERS: QuestFilters = {
  minimumWatchCount: 0,
  minimumYear: 1900,
  maximumYear: new Date().getFullYear(),
  genre: "all",
  libraryId: "all",
  hideDocumentaries: false,
  hideKids: false,
};

function matchesMode(item: MediaItem, mode: QuestMode): boolean {
  switch (mode) {
    case "everything":
      return true;
    case "watched":
      return item.watchCount > 0;
    case "unrated":
      return item.userRating === null;
    case "movies":
      return item.kind === "movie";
    case "shows":
      return item.kind === "show";
  }
}

function matchesGenre(item: MediaItem, genre: string): boolean {
  return (
    genre === "all" ||
    item.genres.some(
      (candidate) => candidate.toLowerCase() === genre.toLowerCase(),
    )
  );
}

function matchesContentExclusions(
  item: MediaItem,
  filters: QuestFilters,
): boolean {
  const genres = new Set(item.genres.map((genre) => genre.toLowerCase()));
  if (filters.hideDocumentaries && genres.has("documentary")) return false;
  if (filters.hideKids && (genres.has("family") || genres.has("kids")))
    return false;
  return true;
}

function matchesFilters(item: MediaItem, filters: QuestFilters): boolean {
  const matchesLibrary =
    filters.libraryId === "all" || item.libraryId === filters.libraryId;
  const matchesYear =
    item.year >= filters.minimumYear && item.year <= filters.maximumYear;
  return (
    item.watchCount >= filters.minimumWatchCount &&
    matchesYear &&
    matchesLibrary &&
    matchesGenre(item, filters.genre) &&
    matchesContentExclusions(item, filters)
  );
}

export function filterMedia(
  items: readonly MediaItem[],
  mode: QuestMode,
  filters: QuestFilters,
): MediaItem[] {
  return items.filter(
    (item) => matchesMode(item, mode) && matchesFilters(item, filters),
  );
}

export function calculateStats(
  items: readonly MediaItem[],
  ratings: Readonly<Record<string, PendingRating>>,
  skips: number,
): QuestStats {
  const applied = Object.values(ratings).filter(
    (rating) => rating.value !== null,
  );
  const sum = applied.reduce((total, rating) => total + (rating.value ?? 0), 0);
  const genreCount = new Map<string, number>();
  for (const rating of applied) {
    const item = items.find((candidate) => candidate.id === rating.mediaId);
    for (const genre of item?.genres ?? [])
      genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }
  const topGenre =
    [...genreCount.entries()].sort(
      (first, second) => second[1] - first[1],
    )[0]?.[0] ?? "—";
  return {
    count: applied.length,
    average: applied.length === 0 ? 0 : sum / applied.length,
    fiveStarCount: applied.filter((rating) => rating.value === 10).length,
    skips,
    rerated: applied.filter((rating) => rating.previousValue !== null).length,
    topGenre,
  };
}

export function estimateMinutes(itemCount: number): number {
  return Math.max(1, Math.ceil((itemCount * 1.7) / 60));
}
