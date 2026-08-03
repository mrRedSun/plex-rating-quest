"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CirclePause,
  Flame,
  Gamepad2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPlexRating,
  buildPlexAuthUrl,
  createPlexPin,
  fetchPlexLibraries,
  fetchPlexMedia,
  fetchPlexServers,
  waitForPlexToken,
} from "../../lib/plex-client";
import { logError, logEvent } from "../../lib/diagnostics";
import {
  calculateStats,
  DEFAULT_FILTERS,
  estimateMinutes,
  filterMedia,
} from "../../lib/quest";
import type {
  MediaItem,
  PlexServer,
  QuestFilters,
  QuestMode,
} from "../../lib/types";
import { useQuestStore } from "../../store/quest-store";
import { TierListStudio } from "./TierListStudio";
import {
  Brand,
  DiagnosticsButton,
  PrimaryButton,
  Shell,
  StarPicker,
} from "./QuestUi";

const MODE_OPTIONS: readonly {
  readonly id: QuestMode;
  readonly label: string;
  readonly description: string;
  readonly recommended?: boolean;
}[] = [
  {
    id: "watched",
    label: "Watched only",
    description: "The titles you know best.",
    recommended: true,
  },
  {
    id: "unrated",
    label: "Unrated only",
    description: "Clear your rating backlog.",
  },
  {
    id: "everything",
    label: "Everything",
    description: "Revisit every title.",
  },
  {
    id: "movies",
    label: "Movies only",
    description: "A feature-length quest.",
  },
  {
    id: "shows",
    label: "Shows only",
    description: "Rate the series, skip the episodes.",
  },
];

function formatDate(value: string): string {
  if (value === "Never") return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const Welcome = observer(function Welcome(): React.ReactElement {
  const startDemo = useQuestStore((state) => state.startDemo);
  const [status, setStatus] = useState<"idle" | "connecting" | "choosing">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<readonly PlexServer[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setPlexData = useQuestStore((state) => state.setPlexData);

  const finishConnection = useCallback(
    async (
      accessToken: string,
      server: PlexServer,
      servers: readonly PlexServer[],
    ): Promise<void> => {
      const libraries = await fetchPlexLibraries(server);
      const media = await fetchPlexMedia(server, libraries);
      setPlexData(accessToken, servers, server, libraries, media);
    },
    [setPlexData],
  );

  const connect = useCallback(async (): Promise<void> => {
    logEvent("auth.connection.started");
    setError(null);
    setStatus("connecting");
    const controller = new AbortController();
    abortRef.current = controller;
    const popup = window.open(
      "about:blank",
      "plex-auth",
      "popup,width=720,height=760",
    );
    try {
      if (popup === null)
        throw new Error(
          "Your browser blocked the Plex sign-in window. Allow pop-ups for this site and try again.",
        );
      popup.document.title = "Connecting to Plex…";
      const pin = await createPlexPin();
      popup.location.href = buildPlexAuthUrl(pin);
      const accessToken = await waitForPlexToken(pin, controller.signal);
      popup.close();
      const servers = await fetchPlexServers(accessToken);
      if (servers.length === 0)
        throw new Error("No reachable Plex Media Server was found.");
      if (servers.length > 1) {
        setToken(accessToken);
        setChoices(servers);
        setStatus("choosing");
      } else {
        const server = servers[0];
        if (server === undefined)
          throw new Error("No Plex server was selected.");
        await finishConnection(accessToken, server, servers);
      }
    } catch (reason) {
      popup?.close();
      logError("auth.connection.failed", reason);
      if (!(reason instanceof DOMException && reason.name === "AbortError"))
        setError(
          reason instanceof Error ? reason.message : "Plex connection failed.",
        );
      setStatus("idle");
    }
  }, [finishConnection]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <Shell>
      <header className="topbar">
        <Brand />
        <div className="privacy-pill">
          <LockKeyhole size={14} /> Browser-only · no server
        </div>
      </header>
      <section className="welcome-grid">
        <motion.div
          className="welcome-copy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="eyebrow">
            <Sparkles size={14} /> Your watch history, reimagined
          </div>
          <h1>
            Rate your library.
            <br />
            <span>Finish the quest.</span>
          </h1>
          <p className="lede">
            Turn a mountain of watched titles into a fast, cinematic rating
            game. Nothing reaches Plex until you say so.
          </p>
          <div className="welcome-actions">
            <PrimaryButton
              onClick={() => {
                void connect();
              }}
              disabled={status !== "idle"}
            >
              {status === "connecting" ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Waiting for Plex
                </>
              ) : (
                <>
                  Continue with Plex <ChevronRight size={18} />
                </>
              )}
            </PrimaryButton>
            <PrimaryButton variant="secondary" onClick={startDemo}>
              Explore demo
            </PrimaryButton>
          </div>
          {error === null ? null : (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="trust-row">
            <span>
              <ShieldCheck size={17} /> Official PIN sign-in
            </span>
            <span>
              <Check size={17} /> Batch confirmation
            </span>
            <span>
              <Check size={17} /> Local queue
            </span>
          </div>
        </motion.div>
        <motion.div
          className="quest-preview"
          initial={{ opacity: 0, scale: 0.96, rotate: 1 }}
          animate={{ opacity: 1, scale: 1, rotate: -1 }}
          transition={{ delay: 0.12 }}
        >
          <div className="preview-glow" />
          <div className="preview-card">
            <div className="poster-sample">
              <span>
                THE
                <br />
                LAST
                <br />
                HORIZON
              </span>
              <small>2024</small>
            </div>
            <div className="preview-info">
              <span className="micro-label">NOW RATING · 142 / 643</span>
              <h2>The Last Horizon</h2>
              <p>Sci-Fi · Drama · 2h 28m</p>
              <div className="sample-stars">★★★★★</div>
              <div className="progress-track">
                <span style={{ width: "63%" }} />
              </div>
              <div className="preview-meta">
                <span>🔥 27 streak</span>
                <span>63% complete</span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>
      {status !== "choosing" ? null : (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="server-title"
        >
          <div className="modal-card">
            <span className="brand-mark">
              <Gamepad2 size={20} />
            </span>
            <h2 id="server-title">Choose your server</h2>
            <p>We found more than one Plex Media Server.</p>
            <div className="server-list">
              {choices.map((server) => (
                <button
                  key={`${server.name}-${server.uri}`}
                  onClick={() => {
                    if (token !== null)
                      void finishConnection(token, server, choices);
                  }}
                >
                  <span>{server.name}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
});

const ModeSelect = observer(function ModeSelect(): React.ReactElement {
  const mode = useQuestStore((state) => state.mode);
  const setMode = useQuestStore((state) => state.setMode);
  const setStage = useQuestStore((state) => state.setStage);
  const media = useQuestStore((state) => state.media);
  const userName = useQuestStore((state) => state.userName);
  const movieCount = media.filter((item) => item.kind === "movie").length;
  const showCount = media.filter((item) => item.kind === "show").length;
  return (
    <Shell compact>
      <header className="topbar">
        <Brand />
        <span className="step-label">Step 1 of 2</span>
      </header>
      <section className="content-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Welcome, {userName}</span>
            <h1>Choose your quest</h1>
            <p>
              {movieCount.toLocaleString()} movies ·{" "}
              {showCount.toLocaleString()} shows ready to rate
            </p>
          </div>
          <div className="library-orb">
            <span>{media.length}</span>
            <small>titles</small>
          </div>
        </div>
        <div className="mode-grid">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`mode-card${mode === option.id ? " selected" : ""}`}
              onClick={() => setMode(option.id)}
            >
              <span className="mode-check">
                {mode === option.id ? <Check size={16} /> : null}
              </span>
              {option.recommended === true ? (
                <span className="recommended">Recommended</span>
              ) : null}
              <h2>{option.label}</h2>
              <p>{option.description}</p>
              <strong>
                {filterMedia(media, option.id, DEFAULT_FILTERS).length} titles
              </strong>
            </button>
          ))}
        </div>
        <div className="bottom-actions">
          <button className="tier-entry" onClick={() => setStage("tier-list")}>
            <Trophy size={18} />
            <span>
              <strong>Build a show tier list</strong>
              <small>Rank watched shows and export it</small>
            </span>
          </button>
          <PrimaryButton onClick={() => setStage("filters")}>
            Set your filters <ArrowRight size={18} />
          </PrimaryButton>
        </div>
      </section>
    </Shell>
  );
});

const Filters = observer(function Filters(): React.ReactElement {
  const filters = useQuestStore((state) => state.filters);
  const setFilters = useQuestStore((state) => state.setFilters);
  const setStage = useQuestStore((state) => state.setStage);
  const createSession = useQuestStore((state) => state.createSession);
  const libraries = useQuestStore((state) => state.libraries);
  const media = useQuestStore((state) => state.media);
  const mode = useQuestStore((state) => state.mode);
  const count = filterMedia(media, mode, filters).length;
  const minutes = estimateMinutes(count);
  const minimumWatchCount =
    mode === "watched"
      ? Math.max(1, filters.minimumWatchCount)
      : filters.minimumWatchCount;
  const update = <Key extends keyof QuestFilters>(
    key: Key,
    value: QuestFilters[Key],
  ): void => setFilters({ ...filters, [key]: value });
  const genres = [...new Set(media.flatMap((item) => item.genres))].sort();
  const resetFilters = (): void =>
    setFilters({
      ...DEFAULT_FILTERS,
      minimumWatchCount: mode === "watched" ? 1 : 0,
    });
  return (
    <Shell compact>
      <header className="topbar">
        <Brand />
        <span className="step-label">Step 2 of 2</span>
      </header>
      <section className="content-panel filters-panel">
        <div className="filter-hero">
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> Build your challenge
            </span>
            <h1>Shape the quest.</h1>
            <p>Pick a vibe, sharpen the rules, then chase the streak.</p>
          </div>
          <div className="quest-energy">
            <Flame size={22} />
            <span>
              <strong>
                {Math.max(1, Math.round(count / Math.max(1, minutes)))}
              </strong>
              <small>ratings / min</small>
            </span>
          </div>
        </div>
        <div className="preset-row" aria-label="Quest presets">
          <button
            onClick={() =>
              setFilters({
                ...DEFAULT_FILTERS,
                minimumWatchCount: mode === "watched" ? 1 : 0,
              })
            }
          >
            <Zap size={17} />
            <span>
              <strong>Speed run</strong>
              <small>Everything eligible</small>
            </span>
          </button>
          <button
            onClick={() =>
              setFilters({
                ...DEFAULT_FILTERS,
                minimumWatchCount: 2,
                maximumYear: 2014,
              })
            }
          >
            <Flame size={17} />
            <span>
              <strong>Deep cuts</strong>
              <small>Rewatched classics</small>
            </span>
          </button>
          <button
            onClick={() =>
              setFilters({
                ...DEFAULT_FILTERS,
                minimumWatchCount: mode === "watched" ? 1 : 0,
                minimumYear: 2018,
              })
            }
          >
            <Sparkles size={17} />
            <span>
              <strong>Modern hits</strong>
              <small>2018 and newer</small>
            </span>
          </button>
        </div>
        <div className="filters-layout">
          <div className="filter-card">
            <div className="filter-card-title">
              <span className="filter-number">01</span>
              <div>
                <h2>Set the rules</h2>
                <p>Every choice updates your quest forecast instantly.</p>
              </div>
            </div>
            <div className="field-row">
              <label>
                Minimum plays
                <span className="field-hint">
                  {mode === "watched"
                    ? "Watched mode always requires 1+"
                    : "Zero includes unwatched titles"}
                </span>
                <input
                  type="number"
                  min={mode === "watched" ? 1 : 0}
                  value={minimumWatchCount}
                  onChange={(event) =>
                    update(
                      "minimumWatchCount",
                      Math.max(
                        mode === "watched" ? 1 : 0,
                        Number(event.target.value),
                      ),
                    )
                  }
                />
              </label>
              <label>
                Library<span className="field-hint">Choose your arena</span>
                <select
                  value={filters.libraryId}
                  onChange={(event) => update("libraryId", event.target.value)}
                >
                  <option value="all">All libraries</option>
                  {libraries.map((library) => (
                    <option key={library.id} value={library.id}>
                      {library.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-row">
              <label>
                From year<span className="field-hint">Start of the era</span>
                <input
                  type="number"
                  min="1900"
                  value={filters.minimumYear}
                  onChange={(event) =>
                    update("minimumYear", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Through year<span className="field-hint">End of the era</span>
                <input
                  type="number"
                  min="1900"
                  value={filters.maximumYear}
                  onChange={(event) =>
                    update("maximumYear", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label>
              Genre<span className="field-hint">Follow your current mood</span>
              <select
                value={filters.genre}
                onChange={(event) => update("genre", event.target.value)}
              >
                <option value="all">Surprise me — all genres</option>
                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </label>
            <div className="toggle-row">
              <label
                htmlFor="hide-documentaries"
                aria-label="Skip documentaries"
              >
                <input
                  id="hide-documentaries"
                  type="checkbox"
                  checked={filters.hideDocumentaries}
                  onChange={(event) =>
                    update("hideDocumentaries", event.target.checked)
                  }
                />
                <span>
                  <b>Skip documentaries</b>
                  <small>Keep it fictional</small>
                </span>
              </label>
              <label
                htmlFor="hide-kids"
                aria-label="Hide kids and family titles"
              >
                <input
                  id="hide-kids"
                  type="checkbox"
                  checked={filters.hideKids}
                  onChange={(event) => update("hideKids", event.target.checked)}
                />
                <span>
                  <b>Grown-up mode</b>
                  <small>Hide kids & family</small>
                </span>
              </label>
            </div>
          </div>
          <aside className="session-summary">
            <div className="summary-badge">
              <Flame size={15} /> Quest forecast
            </div>
            <strong>{count}</strong>
            <h2>titles await</h2>
            <div className="forecast-track">
              <span
                style={{
                  width: `${Math.min(100, Math.max(8, (count / Math.max(1, media.length)) * 100))}%`,
                }}
              />
            </div>
            <p>
              <span>Estimated run</span>
              <b>{minutes} min</b>
            </p>
            <p>
              <span>Mode lock</span>
              <b>{mode === "watched" ? "Watched 1+" : mode}</b>
            </p>
            <p>
              <span>Plex changes</span>
              <b>Final checkpoint</b>
            </p>
            <div className="streak-tease">
              <Zap size={15} />
              <span>First milestone at 25 ratings</span>
            </div>
            <PrimaryButton onClick={createSession} disabled={count === 0}>
              <Play size={17} fill="currentColor" /> Begin the quest
            </PrimaryButton>
          </aside>
        </div>
        <div className="bottom-actions">
          <PrimaryButton variant="ghost" onClick={() => setStage("mode")}>
            <ArrowLeft size={18} /> Back
          </PrimaryButton>
          <button className="text-button" onClick={resetFilters}>
            Reset the challenge
          </button>
        </div>
      </section>
    </Shell>
  );
});

const RatingGame = observer(function RatingGame(): React.ReactElement {
  const session = useQuestStore((state) => state.session);
  const index = useQuestStore((state) => state.index);
  const ratings = useQuestStore((state) => state.ratings);
  const rateCurrent = useQuestStore((state) => state.rateCurrent);
  const skipCurrent = useQuestStore((state) => state.skipCurrent);
  const previous = useQuestStore((state) => state.previous);
  const next = useQuestStore((state) => state.next);
  const isPaused = useQuestStore((state) => state.isPaused);
  const togglePause = useQuestStore((state) => state.togglePause);
  const setStage = useQuestStore((state) => state.setStage);
  const item = session[index];
  const rating =
    item === undefined ? null : (ratings[item.id]?.value ?? item.userRating);
  const progress =
    session.length === 0 ? 0 : Math.round(((index + 1) / session.length) * 100);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isPaused) {
        if (event.key === "Escape") togglePause();
        return;
      }
      if (/^[1-5]$/.test(event.key)) rateCurrent(Number(event.key) * 2);
      else if (event.key === " ") {
        event.preventDefault();
        skipCurrent();
      } else if (event.key === "ArrowLeft") previous();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "Escape") togglePause();
      else if (event.key === "Enter" && rating !== null) rateCurrent(rating);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPaused, next, previous, rateCurrent, rating, skipCurrent, togglePause]);

  if (item === undefined)
    return (
      <Shell>
        <div className="empty-state">
          <h1>No titles found</h1>
          <PrimaryButton onClick={() => setStage("filters")}>
            Change filters
          </PrimaryButton>
        </div>
      </Shell>
    );
  return (
    <main
      className="rating-shell"
      style={
        {
          "--backdrop":
            item.backdropUrl === null ? "none" : `url(${item.backdropUrl})`,
        } as React.CSSProperties
      }
    >
      <div className="rating-backdrop" />
      <div className="rating-vignette" />
      <header className="rating-header">
        <Brand />
        <div className="rating-progress">
          <span>
            {index + 1} <i>/</i> {session.length}
          </span>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>
            {progress}% · {session.length - index - 1} remaining
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="Pause quest"
          onClick={togglePause}
        >
          <CirclePause />
        </button>
      </header>
      <AnimatePresence mode="wait">
        <motion.section
          key={item.id}
          className="rating-content"
          initial={{ opacity: 0, x: 70, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -80, rotate: -2 }}
          transition={{ duration: 0.32 }}
        >
          <div className="game-poster">
            {item.posterUrl === null ? (
              <div className="poster-fallback">{item.title}</div>
            ) : (
              <img src={item.posterUrl} alt={`${item.title} poster`} />
            )}
            <div className="poster-sheen" />
          </div>
          <div className="game-info">
            <div className="title-kind">
              {item.kind} · watched {item.watchCount}×
            </div>
            <h1>{item.title}</h1>
            <div className="metadata">
              <span>{item.year}</span>
              <span>
                {Math.floor(item.runtimeMinutes / 60)}h{" "}
                {item.runtimeMinutes % 60}m
              </span>
              <span>{item.genres.join(" · ")}</span>
            </div>
            <div className="score-row">
              <span>
                <small>AUDIENCE</small>
                <b>{item.audienceRating?.toFixed(1) ?? "—"}</b>
              </span>
              <span>
                <small>CRITICS</small>
                <b>{item.criticRating?.toFixed(1) ?? "—"}</b>
              </span>
              <span>
                <small>LAST WATCHED</small>
                <b>{formatDate(item.watchedAt)}</b>
              </span>
            </div>
            <div className="rate-area">
              <span className="eyebrow">What did you think?</span>
              <StarPicker value={rating} onChange={rateCurrent} />
              <p>
                {rating === null
                  ? "Choose a rating"
                  : `${(rating / 2).toFixed(1)} out of 5`}
              </p>
            </div>
            <div className="rating-actions">
              <button onClick={skipCurrent}>
                Skip <kbd>Space</kbd>
              </button>
              <button onClick={() => rateCurrent(null)}>
                <Trash2 size={16} /> Remove rating
              </button>
            </div>
          </div>
        </motion.section>
      </AnimatePresence>
      <footer className="rating-footer">
        <button onClick={previous} disabled={index === 0}>
          <ArrowLeft size={17} /> Previous
        </button>
        <div>
          <span>
            <kbd>1–5</kbd> Rate
          </span>
          <span>
            <kbd>← →</kbd> Navigate
          </span>
          <span>
            <kbd>Esc</kbd> Pause
          </span>
        </div>
        <button onClick={next} disabled={index >= session.length - 1}>
          Next <ArrowRight size={17} />
        </button>
      </footer>
      <DiagnosticsButton />
      {!isPaused ? null : <PauseMenu />}
    </main>
  );
});

const PauseMenu = observer(function PauseMenu(): React.ReactElement {
  const togglePause = useQuestStore((state) => state.togglePause);
  const setStage = useQuestStore((state) => state.setStage);
  const reset = useQuestStore((state) => state.reset);
  return (
    <div
      className="modal-backdrop pause"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <motion.div
        className="modal-card pause-card"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <span className="eyebrow">Quest paused</span>
        <h2 id="pause-title">Take a breather.</h2>
        <p>Your ratings are saved on this device.</p>
        <PrimaryButton onClick={togglePause}>
          <Play size={17} fill="currentColor" /> Resume
        </PrimaryButton>
        <PrimaryButton
          variant="secondary"
          onClick={() => {
            togglePause();
            setStage("review");
          }}
        >
          Review & finish
        </PrimaryButton>
        <button className="danger-link" onClick={reset}>
          <LogOut size={16} /> Leave quest
        </button>
      </motion.div>
    </div>
  );
});

const Review = observer(function Review(): React.ReactElement {
  const media = useQuestStore((state) => state.media);
  const ratings = useQuestStore((state) => state.ratings);
  const updateRating = useQuestStore((state) => state.updateRating);
  const setStage = useQuestStore((state) => state.setStage);
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () =>
      Object.values(ratings)
        .map((rating) => ({
          rating,
          item: media.find((item) => item.id === rating.mediaId),
        }))
        .filter(
          (entry): entry is { rating: typeof entry.rating; item: MediaItem } =>
            entry.item !== undefined,
        )
        .filter((entry) =>
          entry.item.title.toLowerCase().includes(query.toLowerCase()),
        ),
    [media, query, ratings],
  );
  const total = Object.keys(ratings).length;
  return (
    <Shell compact>
      <header className="topbar">
        <Brand />
        <span className="step-label">
          <ShieldCheck size={15} /> Nothing sent yet
        </span>
      </header>
      <section className="review-panel">
        <div className="review-heading">
          <div>
            <span className="eyebrow">Final checkpoint</span>
            <h1>Review your ratings</h1>
            <p>Make any last changes before committing this batch to Plex.</p>
          </div>
          <div className="review-count">
            <strong>{total}</strong>
            <span>pending changes</span>
          </div>
        </div>
        <div className="review-toolbar">
          <label>
            <Search size={18} />
            <input
              aria-label="Search ratings"
              placeholder="Search your ratings"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span>{entries.length} shown</span>
        </div>
        <div className="review-list">
          {entries.map(({ item, rating }) => (
            <div className="review-row" key={item.id}>
              <div className="review-thumb">
                {item.posterUrl === null ? (
                  <span>{item.title.slice(0, 1)}</span>
                ) : (
                  <img src={item.posterUrl} alt="" />
                )}
              </div>
              <div className="review-title">
                <strong>{item.title}</strong>
                <span>
                  {item.year} · {item.kind}
                </span>
              </div>
              <StarPicker
                compact
                value={rating.value}
                onChange={(value) => updateRating(item.id, value)}
              />
              <button
                className="icon-button subtle"
                aria-label={`Remove ${item.title} from batch`}
                onClick={() => updateRating(item.id, null)}
              >
                <X size={18} />
              </button>
            </div>
          ))}
          {entries.length === 0 ? (
            <div className="empty-list">No matching ratings.</div>
          ) : null}
        </div>
        <div className="commit-bar">
          <div>
            <ShieldCheck size={20} />
            <p>
              <strong>One batch. Your control.</strong>
              <span>You’ll see progress and any failures.</span>
            </p>
          </div>
          <div>
            <PrimaryButton variant="ghost" onClick={() => setStage("rating")}>
              <ArrowLeft size={18} /> Keep rating
            </PrimaryButton>
            <PrimaryButton
              onClick={() => setStage("applying")}
              disabled={total === 0}
            >
              Apply {total} ratings <ChevronRight size={18} />
            </PrimaryButton>
          </div>
        </div>
      </section>
    </Shell>
  );
});

const Applying = observer(function Applying(): React.ReactElement {
  const ratings = useQuestStore((state) => state.ratings);
  const server = useQuestStore((state) => state.selectedServer);
  const isDemo = useQuestStore((state) => state.isDemo);
  const setStage = useQuestStore((state) => state.setStage);
  const [completed, setCompleted] = useState(0);
  const [failures, setFailures] = useState(0);
  const started = useRef(false);
  const entries = useMemo(() => Object.values(ratings), [ratings]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const apply = async (): Promise<void> => {
      let failureCount = 0;
      for (const [index, rating] of entries.entries()) {
        try {
          if (isDemo)
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 240),
            );
          else if (server === null)
            throw new Error(
              "The Plex server connection is unavailable. Reconnect before applying ratings.",
            );
          else await applyPlexRating(server, rating.mediaId, rating.value);
        } catch (reason) {
          failureCount += 1;
          logError("quest.batch.item.failed", reason, { position: index + 1 });
          setFailures((count) => count + 1);
        }
        setCompleted(index + 1);
      }
      logEvent("quest.batch.completed", {
        attempted: entries.length,
        failures: failureCount,
      });
      window.setTimeout(() => setStage("complete"), 450);
    };
    void apply();
  }, [entries, isDemo, server, setStage]);
  const percent =
    entries.length === 0 ? 100 : Math.round((completed / entries.length) * 100);
  return (
    <Shell>
      <section className="applying-screen">
        <div className="apply-orbit">
          <div
            className="apply-ring"
            style={
              { "--progress": `${percent * 3.6}deg` } as React.CSSProperties
            }
          >
            <span>
              <LoaderCircle className="spin" />
              <strong>{percent}%</strong>
            </span>
          </div>
          <i className="spark spark-one" />
          <i className="spark spark-two" />
          <i className="spark spark-three" />
        </div>
        <span className="eyebrow">Committing your quest</span>
        <h1>Applying ratings…</h1>
        <p>
          <strong>{completed}</strong> / {entries.length}
        </p>
        <small>
          {failures === 0
            ? "Keep this tab open. Your queue is safe."
            : `${failures} failed · remaining ratings will continue`}
        </small>
      </section>
    </Shell>
  );
});

const Complete = observer(function Complete(): React.ReactElement {
  const media = useQuestStore((state) => state.media);
  const ratings = useQuestStore((state) => state.ratings);
  const skips = useQuestStore((state) => state.skips);
  const startedAt = useQuestStore((state) => state.startedAt);
  const reset = useQuestStore((state) => state.reset);
  const stats = calculateStats(media, ratings, skips);
  const [duration] = useState(() =>
    startedAt === null
      ? 0
      : Math.max(
          1,
          Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000),
        ),
  );
  return (
    <Shell>
      <section className="complete-screen">
        <motion.div
          className="trophy"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", delay: 0.15 }}
        >
          <Star fill="currentColor" />
        </motion.div>
        <span className="eyebrow">Quest complete</span>
        <h1>{stats.count} ratings added.</h1>
        <p>Your library has never looked more personal.</p>
        <div className="stats-grid">
          <div>
            <span>Average rating</span>
            <strong>
              {stats.average === 0 ? "—" : (stats.average / 2).toFixed(1)}{" "}
              <small>/ 5</small>
            </strong>
          </div>
          <div>
            <span>Top genre</span>
            <strong>{stats.topGenre}</strong>
          </div>
          <div>
            <span>Five-star titles</span>
            <strong>{stats.fiveStarCount}</strong>
          </div>
          <div>
            <span>Completed in</span>
            <strong>{duration} min</strong>
          </div>
          <div>
            <span>Rerated</span>
            <strong>{stats.rerated}</strong>
          </div>
          <div>
            <span>Skipped</span>
            <strong>{stats.skips}</strong>
          </div>
        </div>
        <PrimaryButton onClick={reset}>
          <RotateCcw size={17} /> Start another quest
        </PrimaryButton>
      </section>
    </Shell>
  );
});

export const PlexRatingQuest = observer(
  function PlexRatingQuest(): React.ReactElement {
    const stage = useQuestStore((state) => state.stage);
    const reducedMotion = useReducedMotion();
    useEffect(() => {
      document.documentElement.dataset.motion =
        reducedMotion === true ? "reduced" : "full";
    }, [reducedMotion]);
    if (stage === "welcome") return <Welcome />;
    if (stage === "mode") return <ModeSelect />;
    if (stage === "filters") return <Filters />;
    if (stage === "rating") return <RatingGame />;
    if (stage === "review") return <Review />;
    if (stage === "applying") return <Applying />;
    if (stage === "tier-list") return <TierListStudio />;
    return <Complete />;
  },
);
