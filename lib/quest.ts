import type { MediaItem, PendingRating, QuestFilters, QuestMode, QuestStats } from "./types";

export const DEFAULT_FILTERS: QuestFilters = {
  minimumWatchCount: 0,
  minimumYear: 1900,
  maximumYear: new Date().getFullYear(),
  genre: "all",
  libraryId: "all",
  hideDocumentaries: false,
  hideKids: false,
};

export function filterMedia(items: readonly MediaItem[], mode: QuestMode, filters: QuestFilters): MediaItem[] {
  return items.filter((item) => {
    const matchesMode = mode === "everything"
      || (mode === "watched" && item.watchCount > 0)
      || (mode === "unrated" && item.userRating === null)
      || (mode === "movies" && item.kind === "movie")
      || (mode === "shows" && item.kind === "show");
    const normalizedGenres = item.genres.map((genre) => genre.toLowerCase());
    return matchesMode
      && item.watchCount >= filters.minimumWatchCount
      && item.year >= filters.minimumYear
      && item.year <= filters.maximumYear
      && (filters.genre === "all" || normalizedGenres.includes(filters.genre.toLowerCase()))
      && (filters.libraryId === "all" || item.libraryId === filters.libraryId)
      && (!filters.hideDocumentaries || !normalizedGenres.includes("documentary"))
      && (!filters.hideKids || !normalizedGenres.some((genre) => genre === "family" || genre === "kids"));
  });
}

export function calculateStats(items: readonly MediaItem[], ratings: Readonly<Record<string, PendingRating>>, skips: number): QuestStats {
  const applied = Object.values(ratings).filter((rating) => rating.value !== null);
  const sum = applied.reduce((total, rating) => total + (rating.value ?? 0), 0);
  const genreCount = new Map<string, number>();
  for (const rating of applied) {
    const item = items.find((candidate) => candidate.id === rating.mediaId);
    for (const genre of item?.genres ?? []) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }
  const topGenre = [...genreCount.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? "—";
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
  return Math.max(1, Math.ceil(itemCount * 1.7 / 60));
}
