import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";
import type {
  PlexPinResponse,
  PlexResourceResponse,
  SessionRecord,
} from "./domain.js";
import { readRequestBody } from "./http.js";
import { log } from "./logger.js";

export const PLEX_ENDPOINTS = {
  pin: "https://plex.tv/api/v2/pins",
  resources: "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
  user: "https://plex.tv/api/v2/user",
  community: "https://community.plex.tv/api",
} as const;

export class PlexGateway {
  readonly #clientIdentifier: string;
  readonly #appVersion: string;

  constructor(config: AppConfig) {
    this.#appVersion = config.appVersion;
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
    return resources.map((resource, resourceIndex) => {
      const serverId = createHash("sha256")
        .update(`${resource.name}:${resourceIndex}`)
        .digest("hex")
        .slice(0, 16);
      const token = resource.accessToken ?? record.token ?? "";
      const connections = resource.connections.filter(({ uri }) => {
        try {
          return ["http:", "https:"].includes(new URL(uri).protocol);
        } catch {
          return false;
        }
      });
      record.servers[serverId] = connections.map(({ uri }) => ({ uri, token }));
      return {
        name: resource.name,
        provides: resource.provides,
        connections: connections.map((connection, index) => ({
          ...connection,
          uri: `/api/plex/server/${serverId}/${index}`,
        })),
      };
    });
  }

  async proxyAccount(
    record: SessionRecord,
    request: IncomingMessage,
  ): Promise<Response> {
    return this.#authenticatedProxy(
      record,
      request,
      PLEX_ENDPOINTS.user,
      "account.fetch",
    );
  }

  async proxyCommunity(
    record: SessionRecord,
    request: IncomingMessage,
  ): Promise<Response> {
    return this.#authenticatedProxy(
      record,
      request,
      PLEX_ENDPOINTS.community,
      "community.fetch",
    );
  }

  async proxyServer(
    record: SessionRecord,
    request: IncomingMessage,
    pathname: string,
    search: string,
  ): Promise<Response> {
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
    const target = new URL(remainder, `${connection.uri}/`);
    target.search = search;
    target.searchParams.delete("X-Plex-Token");
    return this.fetch(
      target,
      {
        method: request.method ?? "GET",
        headers: this.#headers(connection.token),
      },
      "server.proxy",
    );
  }

  async pipe(response: ServerResponse, upstream: Response): Promise<void> {
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    response.writeHead(upstream.status, {
      "Content-Type": contentType,
      "Cache-Control": contentType.startsWith("image/")
        ? "private, max-age=3600"
        : "no-store",
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }

  async fetch(
    target: string | URL,
    init: RequestInit,
    operation: string,
  ): Promise<Response> {
    const startedAt = performance.now();
    try {
      const response = await fetch(target, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      });
      log("plex.request.completed", {
        operation,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return response;
    } catch (reason) {
      log("plex.request.failed", {
        operation,
        durationMs: Math.round(performance.now() - startedAt),
        error: reason instanceof Error ? reason.name : "UnknownError",
      });
      throw reason;
    }
  }

  async #authenticatedProxy(
    record: SessionRecord,
    request: IncomingMessage,
    target: string,
    operation: string,
  ): Promise<Response> {
    if (record.token === undefined) throw new Error("Authentication required");
    const headers = this.#headers(record.token);
    const contentType = request.headers["content-type"];
    if (contentType !== undefined) headers.set("Content-Type", contentType);
    const body =
      request.method === "POST" || request.method === "PUT"
        ? await readRequestBody(request)
        : undefined;
    return this.fetch(
      target,
      {
        method: request.method ?? "GET",
        headers,
        ...(body === undefined ? {} : { body }),
      },
      operation,
    );
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
}
