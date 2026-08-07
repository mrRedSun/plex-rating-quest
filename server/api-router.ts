import type { RequestContext, SessionContext } from "./domain.js";
import type { AppConfig } from "./config.js";
import { isSameOrigin, json } from "./http.js";
import type { PlexGateway } from "./plex-gateway.js";
import type { SessionRepository } from "./session-repository.js";

export class ApiRouter {
  readonly #sessions: SessionRepository;
  readonly #plex: PlexGateway;
  readonly #publicOrigin: string;
  readonly #pinRequests = new Map<string, number[]>();
  readonly #pollAttempts = new Map<string, number>();

  constructor(
    sessions: SessionRepository,
    plex: PlexGateway,
    config: AppConfig,
  ) {
    this.#sessions = sessions;
    this.#plex = plex;
    this.#publicOrigin = config.publicOrigin;
  }

  async route(context: RequestContext): Promise<void> {
    const { request, response, url } = context;
    const isMutation = request.method !== "GET" && request.method !== "HEAD";
    if (isMutation && !isSameOrigin(request, this.#publicOrigin))
      return json(response, 403, { error: "Invalid request origin" });
    if (url.pathname.startsWith("/api/auth/")) return this.#auth(context);
    if (url.pathname.startsWith("/api/plex/")) return this.#plexRoute(context);
    json(response, 404, { error: "API route not found" });
  }

  async #auth({ request, response, url }: RequestContext): Promise<void> {
    if (url.pathname === "/api/auth/pin" && request.method === "POST") {
      this.#enforcePinRate(request.socket.remoteAddress ?? "unknown");
      const session =
        this.#sessions.get(request) ?? this.#sessions.create(response);
      const pin = await this.#plex.createPin();
      session.record.pendingPin = {
        id: pin.id,
        code: pin.code,
        createdAt: Date.now(),
      };
      session.record.updatedAt = Date.now();
      await this.#sessions.persist();
      return json(response, 200, {
        id: pin.id,
        code: pin.code,
        clientId: this.#plex.clientIdentifier,
      });
    }
    if (url.pathname === "/api/auth/status" && request.method === "GET")
      return this.#poll(request, response);
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const session = this.#sessions.get(request);
      return json(response, 200, {
        authenticated: session?.record.token !== undefined,
        account: session?.record.account ?? null,
      });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      await this.#sessions.delete(request, response);
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    json(response, 404, { error: "API route not found" });
  }

  async #poll(
    request: RequestContext["request"],
    response: RequestContext["response"],
  ): Promise<void> {
    const session = this.#sessions.get(request);
    const pin = session?.record.pendingPin;
    if (session === null || pin === undefined)
      return json(response, 401, { error: "No pending Plex sign-in" });
    if (Date.now() - pin.createdAt > 10 * 60 * 1000)
      return json(response, 410, { error: "Plex sign-in expired" });
    const attempts = (this.#pollAttempts.get(session.id) ?? 0) + 1;
    this.#pollAttempts.set(session.id, attempts);
    if (attempts > 300) throw new Error("Plex sign-in polling limit exceeded");
    const result = await this.#plex.pollPin(pin.id, pin.code);
    if (result.authToken === undefined || result.authToken === null)
      return json(response, 200, { authenticated: false });
    session.record.token = result.authToken;
    Reflect.deleteProperty(session.record, "pendingPin");
    session.record.updatedAt = Date.now();
    this.#sessions.rotate(session, response);
    this.#pollAttempts.delete(session.id);
    await this.#sessions.persist();
    json(response, 200, { authenticated: true });
  }

  async #plexRoute(context: RequestContext): Promise<void> {
    const session = this.#authenticated(context);
    if (session === null) return;
    const { request, response, url } = context;
    if (url.pathname === "/api/plex/user" && request.method === "GET") {
      const account = await this.#plex.account(session.record);
      await this.#sessions.persist();
      return json(response, 200, account);
    }
    if (url.pathname === "/api/plex/resources" && request.method === "GET") {
      const resources = await this.#plex.discover(session.record);
      session.record.updatedAt = Date.now();
      await this.#sessions.persist();
      return json(response, 200, resources);
    }
    if (url.pathname === "/api/plex/community" && request.method === "POST")
      return this.#plex.pipe(
        response,
        await this.#plex.proxyCommunity(session.record, request),
      );
    if (url.pathname.startsWith("/api/plex/server/"))
      return this.#plex.pipe(
        response,
        await this.#plex.proxyServer(
          session.record,
          request,
          url.pathname,
          url.search,
        ),
      );
    json(response, 404, { error: "API route not found" });
  }

  #authenticated(context: RequestContext): SessionContext | null {
    const session = this.#sessions.get(context.request);
    if (session?.record.token === undefined) {
      json(context.response, 401, { error: "Plex authentication required" });
      return null;
    }
    return session;
  }

  #enforcePinRate(address: string): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const recent = (this.#pinRequests.get(address) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (recent.length >= 10)
      throw new Error("Plex sign-in rate limit exceeded");
    recent.push(Date.now());
    this.#pinRequests.set(address, recent);
  }
}
