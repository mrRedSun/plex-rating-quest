import { z } from "zod";
import { logError, logEvent } from "./diagnostics";
import type { MediaItem, PlexLibrary, PlexServer } from "./types";

const PRODUCT = "Plex Rating Quest";
const PIN_ENDPOINT = "https://plex.tv/api/v2/pins";
const RESOURCE_ENDPOINT = "https://plex.tv/api/v2/resources";

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

interface PlexPin {
  readonly id: number;
  readonly code: string;
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
    "X-Plex-Version": "1.0.0",
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
  const media = results.flat();
  logEvent("plex.media.completed", { mediaCount: media.length });
  return media;
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
