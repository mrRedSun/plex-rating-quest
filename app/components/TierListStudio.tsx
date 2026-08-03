import {
  ArrowLeft,
  Download,
  FileText,
  GripVertical,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import {
  downloadTierListImage,
  downloadTierListMarkdown,
} from "../../lib/tier-export";
import {
  filterTierShows,
  RANKED_TIERS,
  showsInTier,
} from "../../lib/tier-list";
import { DEFAULT_FILTERS } from "../../lib/quest";
import {
  TIER_IDS,
  type MediaItem,
  type QuestFilters,
  type TierId,
} from "../../lib/types";
import { useQuestStore } from "../../store/quest-store";
import { Brand, PrimaryButton, Shell } from "./QuestUi";

const TIER_LABELS: Readonly<Record<TierId, string>> = {
  S: "All-time favorites",
  A: "Excellent",
  B: "Great",
  C: "Good enough",
  D: "Not for me",
  unranked: "Unranked",
};

export const TierListStudio = observer(
  function TierListStudio(): React.ReactElement {
    const media = useQuestStore((store) => store.media);
    const libraries = useQuestStore((store) => store.libraries);
    const filters = useQuestStore((store) => store.filters);
    const assignments = useQuestStore((store) => store.tierAssignments);
    const setFilters = useQuestStore((store) => store.setFilters);
    const assignTier = useQuestStore((store) => store.assignTier);
    const clearTierList = useQuestStore((store) => store.clearTierList);
    const setStage = useQuestStore((store) => store.setStage);
    const [query, setQuery] = useState("");
    const [exportError, setExportError] = useState<string | null>(null);
    const tierFilters = useMemo(
      () => ({
        ...filters,
        minimumWatchCount: Math.max(1, filters.minimumWatchCount),
      }),
      [filters],
    );
    const eligible = useMemo(
      () => filterTierShows(media, tierFilters),
      [media, tierFilters],
    );
    const visibleUnranked = useMemo(() => {
      const normalizedQuery = query.trim().toLowerCase();
      return showsInTier(eligible, assignments, "unranked").filter((item) =>
        item.title.toLowerCase().includes(normalizedQuery),
      );
    }, [assignments, eligible, query]);
    const genres = [
      ...new Set(
        media
          .filter((item) => item.kind === "show")
          .flatMap((item) => item.genres),
      ),
    ].sort();
    const rankedCount =
      eligible.length - showsInTier(eligible, assignments, "unranked").length;
    const update = <Key extends keyof QuestFilters>(
      key: Key,
      value: QuestFilters[Key],
    ): void => setFilters({ ...tierFilters, [key]: value });
    const handleDrop = (
      event: React.DragEvent<HTMLElement>,
      tier: TierId,
    ): void => {
      event.preventDefault();
      const mediaId = event.dataTransfer.getData("text/plain");
      if (eligible.some((item) => item.id === mediaId))
        assignTier(mediaId, tier);
    };
    const exportImage = async (): Promise<void> => {
      setExportError(null);
      try {
        await downloadTierListImage(eligible, assignments);
      } catch (reason) {
        setExportError(
          reason instanceof Error ? reason.message : "Image export failed.",
        );
      }
    };

    return (
      <Shell compact>
        <header className="topbar">
          <Brand />
          <span className="step-label">
            <Trophy size={15} /> Tier List Studio
          </span>
        </header>
        <section className="tier-studio">
          <div className="tier-heading">
            <div>
              <span className="eyebrow">
                <Sparkles size={14} /> Turn taste into a map
              </span>
              <h1>Rank your watched shows.</h1>
              <p>
                Drag shows into tiers or use the accessible tier menu. Your
                draft stays on this device.
              </p>
            </div>
            <div className="tier-actions">
              <PrimaryButton
                variant="secondary"
                disabled={rankedCount === 0}
                onClick={() => downloadTierListMarkdown(eligible, assignments)}
              >
                <FileText size={17} /> Export MD
              </PrimaryButton>
              <PrimaryButton
                disabled={rankedCount === 0}
                onClick={() => {
                  void exportImage();
                }}
              >
                <Download size={17} /> Export image
              </PrimaryButton>
            </div>
          </div>
          {exportError === null ? null : (
            <p className="error-message" role="alert">
              {exportError}
            </p>
          )}
          <div className="tier-layout">
            <aside className="tier-filters">
              <div className="tier-score">
                <strong>{rankedCount}</strong>
                <span>of {eligible.length} ranked</span>
                <div className="forecast-track">
                  <span
                    style={{
                      width: `${eligible.length === 0 ? 0 : (rankedCount / eligible.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <label>
                Minimum plays
                <input
                  type="number"
                  min="1"
                  value={tierFilters.minimumWatchCount}
                  onChange={(event) =>
                    update(
                      "minimumWatchCount",
                      Math.max(1, Number(event.target.value)),
                    )
                  }
                />
              </label>
              <label>
                Library
                <select
                  value={tierFilters.libraryId}
                  onChange={(event) => update("libraryId", event.target.value)}
                >
                  <option value="all">All show libraries</option>
                  {libraries
                    .filter((library) => library.type === "show")
                    .map((library) => (
                      <option key={library.id} value={library.id}>
                        {library.title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="tier-year-row">
                <label>
                  From
                  <input
                    type="number"
                    min="1900"
                    value={tierFilters.minimumYear}
                    onChange={(event) =>
                      update("minimumYear", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Through
                  <input
                    type="number"
                    min="1900"
                    value={tierFilters.maximumYear}
                    onChange={(event) =>
                      update("maximumYear", Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <label>
                Genre
                <select
                  value={tierFilters.genre}
                  onChange={(event) => update("genre", event.target.value)}
                >
                  <option value="all">All genres</option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="text-button"
                onClick={() =>
                  setFilters({ ...DEFAULT_FILTERS, minimumWatchCount: 1 })
                }
              >
                <RotateCcw size={14} /> Reset filters
              </button>
            </aside>
            <div className="tier-board">
              {RANKED_TIERS.map((tier) => {
                const tierItems = showsInTier(eligible, assignments, tier);
                return (
                  // Every drag operation has an equivalent keyboard-accessible tier select on each card.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                  <section
                    className={`tier-row tier-${tier.toLowerCase()}`}
                    key={tier}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, tier)}
                    aria-label={`${tier} tier drop area`}
                    role="group"
                    tabIndex={-1}
                  >
                    <div className="tier-rank">
                      <strong>{tier}</strong>
                      <span>{TIER_LABELS[tier]}</span>
                    </div>
                    <div className="tier-items">
                      {tierItems.map((item) => (
                        <ShowCard
                          key={item.id}
                          item={item}
                          tier={tier}
                          onAssign={assignTier}
                        />
                      ))}
                      {tierItems.length === 0 ? (
                        <span className="tier-empty">Drop a show here</span>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          {/* Every drag operation has an equivalent keyboard-accessible tier select on each card. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <section
            className="unranked-tray"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(event, "unranked")}
            aria-label="Unranked shows drop area"
            role="group"
            tabIndex={-1}
          >
            <div className="unranked-heading">
              <div>
                <h2>Unranked queue</h2>
                <p>{visibleUnranked.length} watched shows match this view</p>
              </div>
              <input
                aria-label="Search unranked shows"
                placeholder="Find a show…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="unranked-grid">
              {visibleUnranked.map((item) => (
                <ShowCard
                  key={item.id}
                  item={item}
                  tier="unranked"
                  onAssign={assignTier}
                />
              ))}
              {visibleUnranked.length === 0 ? (
                <div className="empty-list">No unranked shows match.</div>
              ) : null}
            </div>
          </section>
          <div className="bottom-actions">
            <PrimaryButton variant="ghost" onClick={() => setStage("mode")}>
              <ArrowLeft size={18} /> Back to quests
            </PrimaryButton>
            <button className="danger-link" onClick={clearTierList}>
              <RotateCcw size={15} /> Clear tier list
            </button>
          </div>
        </section>
      </Shell>
    );
  },
);

function ShowCard({
  item,
  tier,
  onAssign,
}: {
  readonly item: MediaItem;
  readonly tier: TierId;
  readonly onAssign: (mediaId: string, tier: TierId) => void;
}): React.ReactElement {
  return (
    // The adjacent native select provides the keyboard-accessible assignment control.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article
      className="tier-show-card"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
      role="group"
      tabIndex={-1}
    >
      <GripVertical className="tier-grip" size={16} aria-hidden="true" />
      <div className="tier-poster">
        {item.posterUrl === null ? (
          <span>{item.title.slice(0, 1)}</span>
        ) : (
          <img src={item.posterUrl} alt="" />
        )}
      </div>
      <div className="tier-show-copy">
        <strong>{item.title}</strong>
        <span>
          {item.year} · watched {item.watchCount}×
        </span>
      </div>
      <label>
        <span className="sr-only">Tier for {item.title}</span>
        <select
          value={tier}
          onChange={(event) => onAssign(item.id, event.target.value as TierId)}
        >
          {TIER_IDS.map((option) => (
            <option key={option} value={option}>
              {option === "unranked" ? "—" : option}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
