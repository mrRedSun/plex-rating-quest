import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";
import type { SessionContext, SessionRecord, SessionStore } from "./domain.js";
import { log } from "./logger.js";

const COOKIE_NAME = "plex_rating_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export class SessionRepository {
  readonly #config: AppConfig;
  readonly #key: Buffer;
  #sessions: SessionStore = {};
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(config: AppConfig) {
    this.#config = config;
    this.#key = createHash("sha256").update(config.sessionSecret).digest();
  }

  async initialize(): Promise<void> {
    await mkdir(this.#config.dataDirectory, { recursive: true, mode: 0o700 });
    try {
      const payload = Buffer.from(
        await readFile(this.#config.sessionFile, "utf8"),
        "base64",
      );
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#key,
        payload.subarray(0, 12),
      );
      decipher.setAuthTag(payload.subarray(12, 28));
      this.#sessions = JSON.parse(
        Buffer.concat([
          decipher.update(payload.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      ) as SessionStore;
      log("session.store.loaded", {
        sessionCount: Object.keys(this.#sessions).length,
      });
      this.#purgeExpired();
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Unable to decrypt the session store; verify SESSION_SECRET",
          { cause: reason },
        );
    }
  }

  get(request: IncomingMessage): SessionContext | null {
    const id = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim().split("="))
      .find(([name]) => name === COOKIE_NAME)?.[1];
    if (id === undefined) return null;
    const record = this.#sessions[id];
    if (record === undefined) return null;
    if (Date.now() - record.updatedAt > MAX_AGE_SECONDS * 1000) {
      Reflect.deleteProperty(this.#sessions, id);
      return null;
    }
    return { id, record };
  }

  create(response: ServerResponse): SessionContext {
    this.#purgeExpired();
    if (Object.keys(this.#sessions).length >= 1000)
      throw new Error("Session capacity reached");
    const id = randomBytes(32).toString("base64url");
    const record: SessionRecord = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      servers: {},
    };
    this.#sessions[id] = record;
    response.setHeader("Set-Cookie", this.#cookie(id, MAX_AGE_SECONDS));
    return { id, record };
  }

  rotate(session: SessionContext, response: ServerResponse): SessionContext {
    const id = randomBytes(32).toString("base64url");
    Reflect.deleteProperty(this.#sessions, session.id);
    session.record.updatedAt = Date.now();
    this.#sessions[id] = session.record;
    response.setHeader("Set-Cookie", this.#cookie(id, MAX_AGE_SECONDS));
    return { id, record: session.record };
  }

  async delete(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const session = this.get(request);
    if (session !== null) Reflect.deleteProperty(this.#sessions, session.id);
    response.setHeader("Set-Cookie", this.#cookie("", 0));
    await this.persist();
  }

  async persist(): Promise<void> {
    this.#writeQueue = this.#writeQueue.then(
      () => this.#writeEncrypted(),
      () => this.#writeEncrypted(),
    );
    await this.#writeQueue;
  }

  #cookie(value: string, maxAge: number): string {
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly;${this.#config.cookieSecure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`;
  }

  async #writeEncrypted(): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(this.#sessions), "utf8"),
      cipher.final(),
    ]);
    const payload = Buffer.concat([
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64");
    const temporaryFile = `${this.#config.sessionFile}.tmp`;
    await writeFile(temporaryFile, payload, { mode: 0o600 });
    await rename(temporaryFile, this.#config.sessionFile);
  }

  #purgeExpired(): void {
    const cutoff = Date.now() - MAX_AGE_SECONDS * 1000;
    for (const [id, record] of Object.entries(this.#sessions))
      if (record.updatedAt < cutoff) Reflect.deleteProperty(this.#sessions, id);
  }
}
