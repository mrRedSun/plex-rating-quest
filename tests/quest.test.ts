import { describe, expect, it } from "vitest";
import { DEMO_MEDIA } from "../lib/demo-data";
import { calculateStats, DEFAULT_FILTERS, estimateMinutes, filterMedia } from "../lib/quest";
import type { PendingRating } from "../lib/types";

describe("filterMedia", () => {
  it("selects watched and unrated quest modes", () => {
    expect(filterMedia(DEMO_MEDIA, "watched", DEFAULT_FILTERS)).toHaveLength(DEMO_MEDIA.length);
    expect(filterMedia(DEMO_MEDIA, "unrated", DEFAULT_FILTERS).every((item) => item.userRating === null)).toBe(true);
  });

  it("combines year, genre, library, and exclusion filters", () => {
    const result = filterMedia(DEMO_MEDIA, "everything", {
      ...DEFAULT_FILTERS,
      minimumYear: 2023,
      genre: "Science Fiction",
      libraryId: "shows",
      hideDocumentaries: true,
      hideKids: true,
    });
    expect(result.map((item) => item.title)).toEqual(["Signal Lost"]);
  });

  it("filters by media kind and watch count", () => {
    const result = filterMedia(DEMO_MEDIA, "movies", { ...DEFAULT_FILTERS, minimumWatchCount: 2 });
    expect(result.every((item) => item.kind === "movie" && item.watchCount >= 2)).toBe(true);
  });

  it("never includes unwatched media in watched mode when the minimum is zero", () => {
    const unwatched = { ...DEMO_MEDIA[0], id: "never-watched", watchCount: 0 };
    const result = filterMedia([...DEMO_MEDIA, unwatched], "watched", {
      ...DEFAULT_FILTERS,
      minimumWatchCount: 0,
    });

    expect(result).not.toContainEqual(unwatched);
    expect(result.every((item) => item.watchCount > 0)).toBe(true);
  });
});

describe("quest summaries", () => {
  it("estimates a minimum one-minute session", () => {
    expect(estimateMinutes(0)).toBe(1);
    expect(estimateMinutes(643)).toBe(19);
  });

  it("calculates rating and rerating statistics", () => {
    const ratings: Record<string, PendingRating> = {
      "m-1": { mediaId: "m-1", value: 10, previousValue: null, updatedAt: "2026-01-01" },
      "m-2": { mediaId: "m-2", value: 8, previousValue: 8, updatedAt: "2026-01-01" },
      "s-1": { mediaId: "s-1", value: null, previousValue: null, updatedAt: "2026-01-01" },
    };
    expect(calculateStats(DEMO_MEDIA, ratings, 3)).toEqual({ count: 2, average: 9, fiveStarCount: 1, skips: 3, rerated: 1, topGenre: "Drama" });
  });

  it("handles an empty completion", () => {
    expect(calculateStats([], {}, 0)).toEqual({ count: 0, average: 0, fiveStarCount: 0, skips: 0, rerated: 0, topGenre: "—" });
  });
});
