import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import type { ServerResponse } from "node:http";
import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
  type Response as UndiciResponse,
} from "undici";
import type { AppConfig } from "./config.js";
import type {
  PlexPinResponse,
  PlexAccountDto,
  PlexResourceResponse,
  SessionRecord,
} from "./domain.js";

interface GatewayLogger {
  info(fields: Readonly<Record<string, unknown>>, message: string): void;
  warn(fields: Readonly<Record<string, unknown>>, message: string): void;
}

const NOOP_LOGGER: GatewayLogger = {
  info: () => undefined,
  warn: () => undefined,
};

interface ValidatedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export function createPinnedLookup(
  resolve: (hostname: string) => Promise<ValidatedAddress>,
): LookupFunction {
  return (hostname, options, callback) => {
    void resolve(hostname)
      .then(({ address, family }) =>
        options.all === true
          ? callback(null, [{ address, family }])
          : callback(null, address, family),
      )
      .catch((reason: unknown) =>
        callback(
          reason instanceof Error ? reason : new Error("DNS lookup failed"),
          options.all === true ? [] : "",
          4,
        ),
      );
  };
}

export const PLEX_ENDPOINTS = {
  pin: "https://plex.tv/api/v2/pins",
  resources: "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
  user: "https://plex.tv/api/v2/user",
  community: "https://community.plex.tv/api",
} as const;

const COMMUNITY_QUERIES = {
  history: `query GetWatchHistoryHub($uuid: ID!, $first: PaginationInt!, $after: String) { user(id: $uuid) { watchHistory(first: $first, after: $after) { nodes { id date metadataItem { id key title type year publishedAt originallyAvailableAt images { coverArt coverPoster thumbnail art } grandparent { key title publishedAt images { coverArt coverPoster thumbnail art } } } } pageInfo { hasNextPage endCursor } } } }`,
  ratings: `query GetRatingsHub($uuid: ID!, $first: PaginationInt!, $after: String) { user(id: $uuid) { ratingsV2(first: $first, after: $after) { nodes { rating metadataItem { id key title type year publishedAt originallyAvailableAt images { coverArt coverPoster thumbnail art } grandparent { key title publishedAt images { coverArt coverPoster thumbnail art } } } } pageInfo { hasNextPage endCursor } } } }`,
} as const;

function validateProxyPath(raw: string, method: string): string {
  const decoded = decodeURIComponent(raw);
  const unsafe =
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.startsWith("//") ||
    decoded.split("/").includes("..");
  if (unsafe) throw new Error("Unsafe Plex server path");
  const getAllowed =
    /^\/library\/sections(?:\/\d+\/all)?$/.test(decoded) ||
    /^\/library\/metadata\/[A-Za-z0-9/_-]+$/.test(decoded);
  if (!(
    (method === "GET" && getAllowed) ||
    (method === "PUT" && decoded === "/:/rate")
  ))
    throw new Error("Plex server operation is not allowed");
  return decoded;
}

function validateRating(target: URL): void {
  const rating = Number(target.searchParams.get("rating"));
  const key = target.searchParams.get("key") ?? "";
  const identifier = target.searchParams.get("identifier");
  const names = [...target.searchParams.keys()];
  const invalid =
    !/^\d+$/.test(key) ||
    identifier !== "com.plexapp.plugins.library" ||
    !Number.isFinite(rating) ||
    (rating !== -1 && (rating < 0 || rating > 10)) ||
    names.some((name) => !["key", "identifier", "rating"].includes(name));
  if (invalid) throw new Error("Invalid Plex rating request");
}

export class PlexGateway {
  readonly #clientIdentifier: string;
  readonly #appVersion: string;
  readonly #allowedPrivateHosts: ReadonlySet<string>;
  readonly #dispatchers = new Map<string, Agent>();
  readonly #fetcher: typeof undiciFetch;
  readonly #logger: GatewayLogger;

  constructor(
    config: AppConfig,
    fetcher: typeof undiciFetch = undiciFetch,
    logger: GatewayLogger = NOOP_LOGGER,
  ) {
    this.#appVersion = config.appVersion;
    this.#allowedPrivateHosts = config.allowedPrivatePlexHosts;
    this.#fetcher = fetcher;
    this.#logger = logger;
    this.#clientIdentifier = createHash("sha256")
      .update(`plex-rating-quest:${config.sessionSecret}`)
      .digest("hex")
      .slice(0, 32);
  }

  get clientIdentifier(): string {
    return this.#clientIdentifier;
  }

  async createPin(): Promise<PlexPinResponse> {
    const headers = this.#headers();
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    const response = await this.fetch(
      PLEX_ENDPOINTS.pin,
      {
        method: "POST",
        headers,
        body: new URLSearchParams({ strong: "true" }),
      },
      "pin.create",
    );
    if (!response.ok) throw new Error("Plex PIN creation failed");
    return (await response.json()) as PlexPinResponse;
  }

  async pollPin(id: number, code: string): Promise<PlexPinResponse> {
    const url = new URL(`${PLEX_ENDPOINTS.pin}/${id}`);
    url.searchParams.set("code", code);
    const response = await this.fetch(
      url,
      { headers: this.#headers() },
      "pin.poll",
    );
    if (!response.ok) throw new Error("Plex sign-in check failed");
    return (await response.json()) as PlexPinResponse;
  }

  async discover(record: SessionRecord): Promise<unknown> {
    if (record.token === undefined) throw new Error("Authentication required");
    const response = await this.fetch(
      PLEX_ENDPOINTS.resources,
      { headers: this.#headers(record.token) },
      "server.discovery",
    );
    if (!response.ok) throw new Error("Plex server discovery failed");
    const resources = (await response.json()) as PlexResourceResponse[];
    return resources
      .map((resource, resourceIndex) => {
        const serverId = createHash("sha256")
          .update(`${resource.name}:${resourceIndex}`)
          .digest("hex")
          .slice(0, 16);
        const token = resource.accessToken;
        if (token === undefined) return null;
        const connections = resource.connections.filter(({ uri }) => {
          try {
            return ["http:", "https:"].includes(new URL(uri).protocol);
          } catch {
            return false;
          }
        });
        record.servers[serverId] = connections.map(({ uri }) => ({
          uri,
          token,
        }));
        return {
          name: resource.name,
          provides: resource.provides,
          connections: connections.map((connection, index) => ({
            local: connection.local === true,
            relay: connection.relay === true,
            uri: `/api/plex/server/${serverId}/${index}`,
          })),
        };
      })
      .filter((resource) => resource !== null);
  }

  async account(record: SessionRecord): Promise<PlexAccountDto> {
    if (record.token === undefined) throw new Error("Authentication required");
    const response = await this.fetch(
      PLEX_ENDPOINTS.user,
      { headers: this.#headers(record.token) },
      "account.fetch",
    );
    if (!response.ok) throw new Error("Plex account request failed");
    const source = (await response.json()) as Record<string, unknown>;
    if (typeof source.uuid !== "string")
      throw new Error("Invalid Plex account response");
    const account: PlexAccountDto = {
      uuid: source.uuid,
      ...(typeof source.username === "string" || source.username === null
        ? { username: source.username }
        : {}),
      ...(typeof source.title === "string" || source.title === null
        ? { title: source.title }
        : {}),
    };
    record.account = account;
    return account;
  }

  async proxyCommunity(
    record: SessionRecord,
    submitted: unknown,
  ): Promise<UndiciResponse> {
    if (record.token === undefined || record.account === undefined)
      throw new Error("Authentication required");
    const requestBody = submitted as {
      readonly query?: unknown;
      readonly variables?: { readonly after?: unknown };
    };
    const operation =
      typeof requestBody.query === "string" &&
      requestBody.query.includes("GetWatchHistoryHub")
        ? "history"
        : typeof requestBody.query === "string" &&
            requestBody.query.includes("GetRatingsHub")
          ? "ratings"
          : null;
    const after = requestBody.variables?.after;
    if (
      operation === null ||
      (after !== undefined && after !== null && typeof after !== "string")
    )
      throw new Error("Unsupported Plex community operation");
    const headers = this.#headers(record.token);
    headers.set("Content-Type", "application/json");
    return this.fetch(
      PLEX_ENDPOINTS.community,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: COMMUNITY_QUERIES[operation],
          variables: {
            uuid: record.account.uuid,
            first: 100,
            after: after ?? null,
          },
        }),
      },
      `community.${operation}`,
    );
  }

  async proxyServer(
    record: SessionRecord,
    requestMethod: string,
    pathname: string,
    search: string,
  ): Promise<UndiciResponse> {
    const match = /^\/api\/plex\/server\/([a-f0-9]{16})\/(\d+)(\/.*)?$/.exec(
      pathname,
    );
    if (match === null) throw new Error("Unknown Plex server path");
    const [, serverId, connectionIndexText, remainder = "/"] = match;
    const connection =
      serverId === undefined
        ? undefined
        : record.servers[serverId]?.[
            Number.parseInt(connectionIndexText ?? "", 10)
          ];
    if (connection === undefined)
      throw new Error("Unknown Plex server connection");
    const method = requestMethod;
    const decoded = validateProxyPath(remainder, method);
    const connectionOrigin = new URL(connection.uri);
    const target = new URL(connectionOrigin);
    target.pathname = decoded;
    target.search = method === "PUT" ? search : "";
    target.searchParams.delete("X-Plex-Token");
    if (method === "PUT") validateRating(target);
    if (target.origin !== connectionOrigin.origin)
      throw new Error("Plex connection origin changed");
    return this.fetch(
      target,
      {
        method,
        headers: this.#headers(connection.token),
      },
      "server.proxy",
    );
  }

  async pipe(
    response: ServerResponse,
    upstream: UndiciResponse,
  ): Promise<void> {
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const maximumBytes = contentType.startsWith("image/")
      ? 20 * 1024 * 1024
      : 64 * 1024 * 1024;
    const declaredLength = Number.parseInt(
      upstream.headers.get("content-length") ?? "0",
      10,
    );
    if (declaredLength > maximumBytes) {
      await upstream.body?.cancel();
      throw new Error("Plex response exceeds the size limit");
    }
    response.writeHead(upstream.status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    if (upstream.body === null) {
      response.end();
      return;
    }
    const reader = upstream.body.getReader();
    let transferred = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array))
        throw new Error("Plex response contained an invalid stream chunk");
      transferred += value.byteLength;
      if (transferred > maximumBytes) {
        await reader.cancel();
        response.destroy(new Error("Plex response exceeds the size limit"));
        return;
      }
      if (!response.write(value))
        await new Promise<void>((resolve) => response.once("drain", resolve));
    }
    response.end();
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.#dispatchers.values()].map((agent) => agent.close()),
    );
    this.#dispatchers.clear();
  }

  async fetch(
    target: string | URL,
    init: RequestInit,
    operation: string,
  ): Promise<UndiciResponse> {
    const startedAt = performance.now();
    try {
      const url = new URL(target);
      await this.#validatedLookup(url.hostname);
      const response = await this.#fetcher(target, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        dispatcher: this.#dispatcher(url),
      } as Parameters<typeof undiciFetch>[1] & {
        readonly dispatcher: Dispatcher;
      });
      this.#logger.info(
        {
          operation,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
        },
        "Plex request completed",
      );
      return response;
    } catch (reason) {
      this.#logger.warn(
        {
          operation,
          durationMs: Math.round(performance.now() - startedAt),
          errorName: reason instanceof Error ? reason.name : "UnknownError",
        },
        "Plex request failed",
      );
      throw reason;
    }
  }

  #headers(token?: string): Headers {
    return new Headers({
      Accept: "application/json",
      "X-Plex-Client-Identifier": this.#clientIdentifier,
      "X-Plex-Product": "Plex Rating Quest",
      "X-Plex-Version": this.#appVersion,
      ...(token === undefined ? {} : { "X-Plex-Token": token }),
    });
  }

  #dispatcher(target: URL): Agent {
    const existing = this.#dispatchers.get(target.origin);
    if (existing !== undefined) return existing;
    const dispatcher = new Agent({
      connect: {
        lookup: createPinnedLookup((hostname) =>
          this.#validatedLookup(hostname),
        ),
      },
    });
    this.#dispatchers.set(target.origin, dispatcher);
    return dispatcher;
  }

  async #validatedLookup(
    requestedHostname: string,
  ): Promise<{ readonly address: string; readonly family: 4 | 6 }> {
    const hostname = requestedHostname.toLowerCase();
    if (["localhost", "metadata.google.internal"].includes(hostname))
      throw new Error("Plex connection destination is not allowed");
    const addresses =
      isIP(hostname) === 0
        ? await lookup(hostname, { all: true, verbatim: true })
        : [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    if (
      addresses.some(({ address }) => isPrivateOrSpecialAddress(address)) &&
      !this.#allowedPrivateHosts.has(hostname)
    )
      throw new Error("Private Plex connection is not operator-allowlisted");
    const selected = addresses[0];
    if (selected === undefined)
      throw new Error("Plex hostname resolved to no addresses");
    return { address: selected.address, family: selected.family as 4 | 6 };
  }
}

function isPrivateOrSpecialAddress(address: string): boolean {
  return address.includes(":")
    ? isPrivateOrSpecialIpv6(address)
    : isPrivateOrSpecialIpv4(address);
}

function isPrivateOrSpecialIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:")
  );
}

function isPrivateOrSpecialIpv4(address: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return true;
  const octets = address.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const value = octets.reduce((total, octet) => total * 256 + octet, 0);
  const blockedRanges = [
    [0x00000000, 0x00ffffff],
    [0x0a000000, 0x0affffff],
    [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff],
    [0xa9fe0000, 0xa9feffff],
    [0xac100000, 0xac1fffff],
    [0xc0a80000, 0xc0a8ffff],
    [0xc6120000, 0xc613ffff],
    [0xe0000000, 0xffffffff],
  ] as const;
  return blockedRanges.some(
    ([minimum, maximum]) => value >= minimum && value <= maximum,
  );
}
