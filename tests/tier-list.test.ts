import { describe, expect, it } from "vitest";
import { DEMO_MEDIA } from "../lib/demo-data";
import { DEFAULT_FILTERS } from "../lib/quest";
import { setLocale } from "../lib/localization";
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

  it("keeps trashed shows out of ranked exports while allowing restoration", () => {
    const shows = filterTierShows(DEMO_MEDIA, DEFAULT_FILTERS);
    const removed = shows[0];
    expect(removed).toBeDefined();
    if (removed === undefined)
      throw new Error("Demo fixtures must contain a show");
    const assignments = { [removed.id]: "trash" as const };

    expect(showsInTier(shows, assignments, "trash")).toEqual([removed]);
    expect(createTierListMarkdown(shows, assignments)).not.toContain(
      `- ${removed.title} (${removed.year})`,
    );
    expect(
      showsInTier(shows, { [removed.id]: "unranked" }, "unranked"),
    ).toContain(removed);
  });

  it("exports an AI-ready Ukrainian tier list when Ukrainian is selected", () => {
    const shows = filterTierShows(DEMO_MEDIA, DEFAULT_FILTERS);
    const first = shows[0];
    expect(first).toBeDefined();
    if (first === undefined)
      throw new Error("Demo fixtures must contain a watched show");
    setLocale("uk");

    const markdown = createTierListMarkdown(shows, { [first.id]: "S" });
    setLocale("en");

    expect(markdown).toContain("# Мій тірліст серіалів Plex");
    expect(markdown).toContain("## Запит для рекомендацій");
    expect(markdown).toContain(`- ${first.title} (${first.year})`);
  });
});
