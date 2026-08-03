import { describe, expect, it } from "vitest";
import { DEMO_MEDIA } from "../lib/demo-data";
import { DEFAULT_FILTERS } from "../lib/quest";
import {
  createTierListMarkdown,
  filterTierShows,
  showsInTier,
} from "../lib/tier-list";

describe("tier-list rules", () => {
  it("includes only watched shows even when the supplied minimum is zero", () => {
    const movie = DEMO_MEDIA.find((item) => item.kind === "movie");
    const show = DEMO_MEDIA.find((item) => item.kind === "show");
    expect(movie).toBeDefined();
    expect(show).toBeDefined();
    if (movie === undefined || show === undefined)
      throw new Error("Demo fixtures must contain movies and shows");
    const unwatchedShow = { ...show, id: "unwatched-show", watchCount: 0 };
    const result = filterTierShows([movie, show, unwatchedShow], {
      ...DEFAULT_FILTERS,
      minimumWatchCount: 0,
    });

    expect(result).toEqual([show]);
  });

  it("groups assignments and produces an AI-ready Markdown export", () => {
    const shows = filterTierShows(DEMO_MEDIA, DEFAULT_FILTERS);
    const first = shows[0];
    expect(first).toBeDefined();
    if (first === undefined)
      throw new Error("Demo fixtures must contain a watched show");
    const assignments = { [first.id]: "S" as const };
    const markdown = createTierListMarkdown(shows, assignments);

    expect(showsInTier(shows, assignments, "S")).toEqual([first]);
    expect(markdown).toContain(`- ${first.title} (${first.year})`);
    expect(markdown).toContain("## Recommendation prompt");
    expect(markdown).not.toContain("token");
  });
});
