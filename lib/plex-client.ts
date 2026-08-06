import { z } from "zod";
import packageMetadata from "../package.json";
import { logError, logEvent } from "./diagnostics";
import type { MediaItem, PlexAccount, PlexLibrary, PlexServer } from "./types";

const PRODUCT = "Plex Rating Quest";
const PIN_ENDPOINT = "https://plex.tv/api/v2/pins";
const RESOURCE_ENDPOINT = "https://plex.tv/api/v2/resources";
const USER_ENDPOINT = "https://plex.tv/api/v2/user";
const COMMUNITY_ENDPOINT = "https://community.plex.tv/api";
const PENDING_PIN_KEY = "plex-rating-quest-pending-pin";
const PIN_MAX_AGE_MS = 10 * 60 * 1000;

const pinSchema = z.object({
  id: z.number(),
  code: z.string(),
  authToken: z.string().nullable().optional(),
});
const resourceSchema = z.array(
  z.object({
    name: z.string(),
    provides: z.string(),
    accessToken: z.string().optional(),
    connections: z.array(
      z.object({
        uri: z.string(),
        local: z.boolean().optional(),
        relay: z.boolean().optional(),
      }),
    ),
  }),
);
const userSchema = z.object({
  uuid: z.string(),
  username: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});
const librarySchema = z.object({
  MediaContainer: z.object({
    Directory: z
      .array(
        z.object({
          key: z.string(),
          title: z.string(),
          type: z.enum(["movie", "show"]),
        }),
      )
      .default([]),
  }),
});
const mediaSchema = z.object({
  MediaContainer: z.object({
    Metadata: z
      .array(
        z.object({
          ratingKey: z.string(),
          title: z.string(),
          year: z.number().optional(),
          type: z.enum(["movie", "show"]),
          duration: z.number().optional(),
          viewCount: z.number().optional(),
          lastViewedAt: z.number().optional(),
          thumb: z.string().optional(),
          art: z.string().optional(),
          audienceRating: z.number().optional(),
          rating: z.number().optional(),
          userRating: z.number().optional(),
          Genre: z.array(z.object({ tag: z.string() })).optional(),
        }),
      )
      .default([]),
  }),
});
const historyImageSchema = z
  .object({
    coverArt: z.string().nullable().optional(),
    coverPoster: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
    art: z.string().nullable().optional(),
  })
  .nullable()
  .optional();
const historyMetadataSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  type: z.enum(["MOVIE", "SHOW", "SEASON", "EPISODE"]),
  year: z.number().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  originallyAvailableAt: z.string().nullable().optional(),
  images: historyImageSchema,
  grandparent: z
    .object({
      key: z.string(),
      title: z.string(),
      publishedAt: z.string().nullable().optional(),
      images: historyImageSchema,
    })
    .nullable()
    .optional(),
});
const historyResponseSchema = z.object({
  data: z.object({
    user: z.object({
      watchHistory: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            date: z.string(),
            metadataItem: historyMetadataSchema,
          }),
        ),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullable().optional(),
        }),
      }),
    }),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});
const ratingsResponseSchema = z.object({
  data: z.object({
    user: z.object({
      ratingsV2: z.object({
        nodes: z.array(
          z.object({
            rating: z.number(),
            metadataItem: historyMetadataSchema,
          }),
        ),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullable().optional(),
        }),
      }),
    }),
  }),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const WATCH_HISTORY_QUERY = `
  query GetWatchHistoryHub($uuid: ID!, $first: PaginationInt!, $after: String) {
    user(id: $uuid) {
      watchHistory(first: $first, after: $after) {
        nodes {
          id
          date
          metadataItem {
            id key title type year publishedAt originallyAvailableAt
            images { coverArt coverPoster thumbnail art }
            grandparent { key title publishedAt images { coverArt coverPoster thumbnail art } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;
const RATINGS_QUERY = `
  query GetRatingsHub($uuid: ID!, $first: PaginationInt!, $after: String) {
    user(id: $uuid) {
      ratingsV2(first: $first, after: $after) {
        nodes {
          rating
          metadataItem {
            id key title type year publishedAt originallyAvailableAt
            images { coverArt coverPoster thumbnail art }
            grandparent { key title publishedAt images { coverArt coverPoster thumbnail art } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export interface PlexPin {
  readonly id: number;
  readonly code: string;
}

const pendingPinSchema = z.object({
  id: z.number(),
  code: z.string(),
  createdAt: z.number(),
});

export function savePendingPlexPin(pin: PlexPin): void {
  window.localStorage.setItem(
    PENDING_PIN_KEY,
    JSON.stringify({ ...pin, createdAt: Date.now() }),
  );
  logEvent("auth.pending.saved");
}

export function readPendingPlexPin(): PlexPin | null {
  const serialized = window.localStorage.getItem(PENDING_PIN_KEY);
  if (serialized === null) return null;
  try {
    const pending = pendingPinSchema.parse(JSON.parse(serialized));
    if (Date.now() - pending.createdAt <= PIN_MAX_AGE_MS)
      return { id: pending.id, code: pending.code };
    logEvent("auth.pending.expired", {}, "warn");
  } catch (reason) {
    logError("auth.pending.invalid", reason);
  }
  clearPendingPlexPin();
  return null;
}

export function clearPendingPlexPin(): void {
  window.localStorage.removeItem(PENDING_PIN_KEY);
}

function getClientId(): string {
  const storageKey = "plex-rating-quest-client-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing !== null) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const created = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  window.localStorage.setItem(storageKey, created);
  return created;
}

function headers(token?: string): HeadersInit {
  return {
    Accept: "application/json",
    "X-Plex-Client-Identifier": getClientId(),
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": packageMetadata.version,
    ...(token === undefined ? {} : { "X-Plex-Token": token }),
  };
}

async function checkedFetch(
  operation: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = performance.now();
  logEvent(
    "plex.request.started",
    { operation, method: init?.method ?? "GET" },
    "debug",
  );
  try {
    const response = await fetch(input, init);
    const durationMs = Math.round(performance.now() - startedAt);
    logEvent(
      "plex.request.completed",
      { operation, status: response.status, durationMs },
      response.ok ? "debug" : "warn",
    );
    if (!response.ok)
      throw new Error(`Plex request failed (${response.status})`);
    return response;
  } catch (reason) {
    logError("plex.request.failed", reason, {
      operation,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw reason;
  }
}

export async function createPlexPin(): Promise<PlexPin> {
  logEvent("auth.pin.create.started");
  const requestHeaders = new Headers(headers());
  requestHeaders.set("Content-Type", "application/x-www-form-urlencoded");
  const response = await checkedFetch("pin.create", PIN_ENDPOINT, {
    method: "POST",
    headers: requestHeaders,
    body: new URLSearchParams({ strong: "true" }),
  });
  const pin = pinSchema.parse(await response.json());
  logEvent("auth.pin.create.completed");
  return { id: pin.id, code: pin.code };
}

export function buildPlexAuthUrl(pin: PlexPin): string {
  logEvent("auth.window.prepared");
  const parameters = new URLSearchParams({
    clientID: getClientId(),
    code: pin.code,
    forwardUrl: window.location.href,
    "context[device][product]": PRODUCT,
  });
  return `https://app.plex.tv/auth#?${parameters.toString()}`;
}

export async function waitForPlexToken(
  pin: PlexPin,
  signal: AbortSignal,
): Promise<string> {
  let attempts = 0;
  logEvent("auth.polling.started");
  while (!signal.aborted) {
    attempts += 1;
    const url = new URL(`${PIN_ENDPOINT}/${pin.id}`);
    url.searchParams.set("code", pin.code);
    const response = await checkedFetch("pin.poll", url, {
      headers: headers(),
      signal,
    });
    const parsed = pinSchema.parse(await response.json());
    if (parsed.authToken !== undefined && parsed.authToken !== null) {
      logEvent("auth.polling.completed", { attempts });
      return parsed.authToken;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
  }
  throw new DOMException("Plex sign-in was cancelled", "AbortError");
}

export async function fetchPlexServers(token: string): Promise<PlexServer[]> {
  logEvent("plex.discovery.started");
  const url = new URL(RESOURCE_ENDPOINT);
  url.searchParams.set("includeHttps", "1");
  url.searchParams.set("includeRelay", "1");
  const response = await checkedFetch("server.discovery", url, {
    headers: headers(token),
  });
  const resources = resourceSchema.parse(await response.json());
  const servers = resources.flatMap((resource) => {
    if (!resource.provides.split(",").includes("server")) return [];
    const connection =
      resource.connections.find(
        (entry) => entry.local === true && entry.uri.startsWith("https://"),
      ) ??
      resource.connections.find((entry) => entry.uri.startsWith("https://")) ??
      resource.connections[0];
    const accessToken = resource.accessToken ?? token;
    return connection === undefined
      ? []
      : [{ name: resource.name, uri: connection.uri, accessToken }];
  });
  logEvent("plex.discovery.completed", { serverCount: servers.length });
  return servers;
}

export async function fetchPlexAccount(token: string): Promise<PlexAccount> {
  logEvent("plex.account.started");
  const response = await checkedFetch("account.fetch", USER_ENDPOINT, {
    headers: headers(token),
  });
  const account = userSchema.parse(await response.json());
  const username = account.username?.trim();
  const title = account.title?.trim();
  const displayName =
    username !== undefined && username.length > 0
      ? username
      : title !== undefined && title.length > 0
        ? title
        : "Plex member";
  logEvent("plex.account.completed");
  return { id: account.uuid, displayName };
}

type HistoryNode = z.infer<
  typeof historyResponseSchema
>["data"]["user"]["watchHistory"]["nodes"][number];

function yearFromDate(value: string | null | undefined): number {
  if (value === undefined || value === null) return 0;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : 0;
}

function firstImage(
  images: z.infer<typeof historyImageSchema>,
  purpose: "poster" | "backdrop",
): string | null {
  if (images === undefined || images === null) return null;
  return purpose === "poster"
    ? (images.coverPoster ?? images.thumbnail ?? null)
    : (images.art ?? images.coverArt ?? null);
}

function historyIdentity(node: HistoryNode): {
  id: string;
  title: string;
  year: number;
  kind: "movie" | "show";
  posterUrl: string | null;
  backdropUrl: string | null;
} | null {
  const item = node.metadataItem;
  if (item.type === "MOVIE")
    return {
      id: item.id,
      title: item.title,
      year: item.year ?? yearFromDate(item.originallyAvailableAt),
      kind: "movie",
      posterUrl: firstImage(item.images, "poster"),
      backdropUrl: firstImage(item.images, "backdrop"),
    };
  const show = item.type === "SHOW" ? item : item.grandparent;
  if (show === undefined || show === null) return null;
  return {
    id: show.key.split("/").filter(Boolean).at(-1) ?? item.id,
    title: show.title,
    year: yearFromDate(show.publishedAt),
    kind: "show",
    posterUrl: firstImage(show.images, "poster"),
    backdropUrl: firstImage(show.images, "backdrop"),
  };
}

async function fetchHistoryPage(
  token: string,
  accountId: string,
  after: string | null,
): Promise<z.infer<typeof historyResponseSchema>> {
  const requestHeaders = new Headers(headers(token));
  requestHeaders.set("Content-Type", "application/json");
  const response = await checkedFetch(
    "history.page.fetch",
    COMMUNITY_ENDPOINT,
    {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        query: WATCH_HISTORY_QUERY,
        variables: { uuid: accountId, first: 100, after },
      }),
    },
  );
  return historyResponseSchema.parse(await response.json());
}

async function fetchRatingsPage(
  token: string,
  accountId: string,
  after: string | null,
): Promise<z.infer<typeof ratingsResponseSchema>> {
  const requestHeaders = new Headers(headers(token));
  requestHeaders.set("Content-Type", "application/json");
  const response = await checkedFetch(
    "ratings.page.fetch",
    COMMUNITY_ENDPOINT,
    {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        query: RATINGS_QUERY,
        variables: { uuid: accountId, first: 100, after },
      }),
    },
  );
  return ratingsResponseSchema.parse(await response.json());
}

function groupHistoryNodes(nodes: readonly HistoryNode[]): MediaItem[] {
  const grouped = new Map<string, MediaItem>();
  for (const node of nodes) {
    const identity = historyIdentity(node);
    if (identity === null) continue;
    const key = `${identity.kind}:${identity.id}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      id: `history:${identity.id}`,
      title: identity.title,
      year: identity.year,
      kind: identity.kind,
      runtimeMinutes: 0,
      genres: [],
      watchCount: (existing?.watchCount ?? 0) + 1,
      watchedAt:
        existing === undefined || node.date > existing.watchedAt
          ? node.date
          : existing.watchedAt,
      posterUrl: identity.posterUrl ?? existing?.posterUrl ?? null,
      backdropUrl: identity.backdropUrl ?? existing?.backdropUrl ?? null,
      audienceRating: null,
      criticRating: null,
      userRating: null,
      libraryId: "watch-history",
    });
  }
  return [...grouped.values()];
}

async function fetchPlexWatchHistory(
  token: string,
  accountId: string,
): Promise<MediaItem[]> {
  logEvent("plex.history.started");
  const nodes: HistoryNode[] = [];
  let after: string | null = null;
  let page = 0;
  do {
    page += 1;
    const parsed = await fetchHistoryPage(token, accountId, after);
    const error = parsed.errors?.[0];
    if (error !== undefined)
      throw new Error(`Plex history failed: ${error.message}`);
    const history = parsed.data.user.watchHistory;
    nodes.push(...history.nodes);
    after = history.pageInfo.hasNextPage
      ? (history.pageInfo.endCursor ?? null)
      : null;
    if (history.pageInfo.hasNextPage && after === null)
      throw new Error("Plex history pagination returned no cursor");
  } while (after !== null);

  const grouped = groupHistoryNodes(nodes);
  logEvent("plex.history.completed", {
    pageCount: page,
    eventCount: nodes.length,
    titleCount: grouped.length,
  });
  return grouped;
}

interface AccountRating {
  readonly id: string;
  readonly title: string;
  readonly year: number;
  readonly kind: "movie" | "show";
  readonly rating: number;
}

async function fetchPlexRatings(
  token: string,
  accountId: string,
): Promise<AccountRating[]> {
  logEvent("plex.ratings.started");
  const ratings: AccountRating[] = [];
  let after: string | null = null;
  let pageCount = 0;
  do {
    pageCount += 1;
    const parsed = await fetchRatingsPage(token, accountId, after);
    const error = parsed.errors?.[0];
    if (error !== undefined)
      throw new Error(`Plex ratings failed: ${error.message}`);
    const connection = parsed.data.user.ratingsV2;
    for (const node of connection.nodes) {
      const identity = historyIdentity({
        id: "rating",
        date: "",
        metadataItem: node.metadataItem,
      });
      if (identity !== null) ratings.push({ ...identity, rating: node.rating });
    }
    after = connection.pageInfo.hasNextPage
      ? (connection.pageInfo.endCursor ?? null)
      : null;
    if (connection.pageInfo.hasNextPage && after === null)
      throw new Error("Plex ratings pagination returned no cursor");
  } while (after !== null);
  logEvent("plex.ratings.completed", {
    pageCount,
    ratingCount: ratings.length,
  });
  return ratings;
}

export async function fetchPlexLibraries(
  server: PlexServer,
): Promise<PlexLibrary[]> {
  logEvent("plex.libraries.started");
  const response = await checkedFetch(
    "libraries.fetch",
    `${server.uri}/library/sections`,
    { headers: headers(server.accessToken) },
  );
  const parsed = librarySchema.parse(await response.json());
  const libraries = parsed.MediaContainer.Directory.map((library) => ({
    id: library.key,
    title: library.title,
    type: library.type,
  }));
  logEvent("plex.libraries.completed", { libraryCount: libraries.length });
  return libraries;
}

export async function fetchPlexMedia(
  server: PlexServer,
  libraries: readonly PlexLibrary[],
  account?: { readonly id: string; readonly token: string },
): Promise<MediaItem[]> {
  logEvent("plex.media.started", { libraryCount: libraries.length });
  const results = await Promise.all(
    libraries.map(async (library) => {
      const response = await checkedFetch(
        "library.media.fetch",
        `${server.uri}/library/sections/${library.id}/all`,
        { headers: headers(server.accessToken) },
      );
      const parsed = mediaSchema.parse(await response.json());
      return parsed.MediaContainer.Metadata.map((item): MediaItem => ({
        id: item.ratingKey,
        title: item.title,
        year: item.year ?? 0,
        kind: item.type,
        runtimeMinutes: Math.round((item.duration ?? 0) / 60_000),
        genres: item.Genre?.map((genre) => genre.tag) ?? [],
        watchCount: item.viewCount ?? 0,
        watchedAt:
          item.lastViewedAt === undefined
            ? "Never"
            : new Date(item.lastViewedAt * 1000).toISOString(),
        posterUrl:
          item.thumb === undefined
            ? null
            : `${server.uri}${item.thumb}?X-Plex-Token=${encodeURIComponent(server.accessToken)}`,
        backdropUrl:
          item.art === undefined
            ? null
            : `${server.uri}${item.art}?X-Plex-Token=${encodeURIComponent(server.accessToken)}`,
        audienceRating: item.audienceRating ?? null,
        criticRating: item.rating ?? null,
        userRating: item.userRating ?? null,
        libraryId: library.id,
      }));
    }),
  );
  const libraryMedia = results.flat();
  if (account === undefined) {
    logEvent("plex.media.completed", { mediaCount: libraryMedia.length });
    return libraryMedia;
  }
  const [historyMedia, accountRatings] = await Promise.all([
    fetchPlexWatchHistory(account.token, account.id),
    fetchPlexRatings(account.token, account.id),
  ]);
  const normalize = (value: string): string =>
    value.toLocaleLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const historyByTitle = new Map(
    historyMedia.map((item) => [
      `${item.kind}:${normalize(item.title)}:${item.year}`,
      item,
    ]),
  );
  const matchedHistoryIds = new Set<string>();
  const mergedLibraryMedia = libraryMedia.map((item) => {
    const historical =
      historyByTitle.get(
        `${item.kind}:${normalize(item.title)}:${item.year}`,
      ) ?? historyByTitle.get(`${item.kind}:${normalize(item.title)}:0`);
    if (historical === undefined) return item;
    matchedHistoryIds.add(historical.id);
    return {
      ...item,
      watchCount: Math.max(item.watchCount, historical.watchCount),
      watchedAt: historical.watchedAt,
    };
  });
  const media = [
    ...mergedLibraryMedia,
    ...historyMedia.filter((item) => !matchedHistoryIds.has(item.id)),
  ];
  const ratingsByTitle = new Map(
    accountRatings.map((rating) => [
      `${rating.kind}:${normalize(rating.title)}:${rating.year}`,
      rating.rating,
    ]),
  );
  const ratedMedia = media.map((item) => ({
    ...item,
    userRating:
      ratingsByTitle.get(
        `${item.kind}:${normalize(item.title)}:${item.year}`,
      ) ??
      ratingsByTitle.get(`${item.kind}:${normalize(item.title)}:0`) ??
      item.userRating,
  }));
  logEvent("plex.media.completed", { mediaCount: ratedMedia.length });
  return ratedMedia;
}

export async function applyPlexRating(
  server: PlexServer,
  mediaId: string,
  value: number | null,
): Promise<void> {
  const url = new URL(`${server.uri}/:/rate`);
  url.searchParams.set("key", mediaId);
  url.searchParams.set("identifier", "com.plexapp.plugins.library");
  url.searchParams.set("rating", value === null ? "-1" : String(value));
  await checkedFetch("rating.apply", url, {
    method: "PUT",
    headers: headers(server.accessToken),
  });
}
