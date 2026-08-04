import { filterMedia } from "./quest";
import { getLocale } from "./localization";
import type { MediaItem, QuestFilters, TierAssignments, TierId } from "./types";

export const RANKED_TIERS = [
  "S",
  "A",
  "B",
  "C",
  "D",
] as const satisfies readonly TierId[];

export function filterTierShows(
  items: readonly MediaItem[],
  filters: QuestFilters,
): MediaItem[] {
  return filterMedia(items, "shows", {
    ...filters,
    minimumWatchCount: Math.max(1, filters.minimumWatchCount),
  });
}

export function showsInTier(
  items: readonly MediaItem[],
  assignments: TierAssignments,
  tier: TierId,
): MediaItem[] {
  return items.filter((item) => (assignments[item.id] ?? "unranked") === tier);
}

function markdownList(items: readonly MediaItem[]): string {
  const ukrainian = getLocale() === "uk";
  return items.length === 0
    ? ukrainian
      ? "- _Немає_"
      : "- _None_"
    : items
        .map(
          (item) =>
            `- ${item.title} (${item.year}) — ${item.genres.join(", ") || (ukrainian ? "Невідомий жанр" : "Unknown genre")}`,
        )
        .join("\n");
}

export function createTierListMarkdown(
  items: readonly MediaItem[],
  assignments: TierAssignments,
): string {
  const ukrainian = getLocale() === "uk";
  const sections = RANKED_TIERS.map(
    (tier) =>
      `## ${tier} ${ukrainian ? "рівень" : "Tier"}\n\n${markdownList(showsInTier(items, assignments, tier))}`,
  );
  const rankedCount = items.filter((item) =>
    RANKED_TIERS.some((tier) => assignments[item.id] === tier),
  ).length;
  return [
    ukrainian ? "# Мій тірліст серіалів Plex" : "# My Plex Show Tier List",
    "",
    ukrainian
      ? `Розташовано ${rankedCount} із ${items.length} переглянутих серіалів.`
      : `Ranked ${rankedCount} of ${items.length} watched shows.`,
    "",
    ...sections.flatMap((section) => [section, ""]),
    ukrainian ? "## Запит для рекомендацій" : "## Recommendation prompt",
    "",
    ukrainian
      ? "На основі цього тірліста порекомендуй серіали, які мені, ймовірно, сподобаються. Поясни зв’язок кожної рекомендації з моїми рівнями S/A, не пропонуй уже перелічені тайтли та додай кілька продуманих неочевидних варіантів."
      : "Based on this tier list, recommend shows I am likely to enjoy. Explain how each recommendation connects to my S/A tiers, avoid titles already listed, and include a few thoughtful wildcards.",
  ].join("\n");
}
