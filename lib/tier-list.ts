import { filterMedia } from "./quest";
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
  return items.length === 0
    ? "- _None_"
    : items
        .map(
          (item) =>
            `- ${item.title} (${item.year}) — ${item.genres.join(", ") || "Unknown genre"}`,
        )
        .join("\n");
}

export function createTierListMarkdown(
  items: readonly MediaItem[],
  assignments: TierAssignments,
): string {
  const sections = RANKED_TIERS.map(
    (tier) =>
      `## ${tier} Tier\n\n${markdownList(showsInTier(items, assignments, tier))}`,
  );
  const rankedCount = items.filter(
    (item) => (assignments[item.id] ?? "unranked") !== "unranked",
  ).length;
  return [
    "# My Plex Show Tier List",
    "",
    `Ranked ${rankedCount} of ${items.length} watched shows.`,
    "",
    ...sections.flatMap((section) => [section, ""]),
    "## Recommendation prompt",
    "",
    "Based on this tier list, recommend shows I am likely to enjoy. Explain how each recommendation connects to my S/A tiers, avoid titles already listed, and include a few thoughtful wildcards.",
  ].join("\n");
}
