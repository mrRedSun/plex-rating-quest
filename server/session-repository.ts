import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config.js";
import type { SessionContext, SessionRecord } from "./domain.js";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;

interface SessionRow {
  readonly id_hash: string;
  readonly payload: Uint8Array;
  readonly created_at: number;
  readonly updated_at: number;
}

export class SessionRepository {
  readonly #config: AppConfig;
  readonly #key: Buffer;
  #database: DatabaseSync | null = null;

  constructor(config: AppConfig) {
    this.#config = config;
    this.#key = createHash("sha256").update(config.sessionSecret).digest();
  }

  async initialize(): Promise<void> {
    await mkdir(this.#config.dataDirectory, { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(this.#config.databaseFile);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY,
        payload BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_updated_at ON sessions(updated_at);
    `);
    this.#database = database;
    this.purgeExpired();
  }

  get(id: string | undefined): SessionContext | null {
    if (id === undefined) return null;
    const row = this.#db()
      .prepare(
        "SELECT id_hash, payload, created_at, updated_at FROM sessions WHERE id_hash = ?",
      )
      .get(this.#idHash(id)) as SessionRow | undefined;
    if (row === undefined) return null;
    if (Date.now() - row.updated_at > MAX_AGE_MS) {
      this.delete(id);
      return null;
    }
    return {
      id,
      record: this.#decrypt(
        row.payload,
        row.id_hash,
        row.created_at,
        row.updated_at,
      ),
    };
  }

  create(): SessionContext {
    this.purgeExpired();
    const count = this.#db()
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get() as {
      readonly count: number;
    };
    if (count.count >= MAX_SESSIONS)
      throw new Error("Session capacity reached");
    const id = randomBytes(32).toString("base64url");
    const now = Date.now();
    const record: SessionRecord = {
      createdAt: now,
      updatedAt: now,
      servers: {},
    };
    this.#insert(id, record);
    return { id, record };
  }

  rotate(session: SessionContext): SessionContext {
    const id = randomBytes(32).toString("base64url");
    const database = this.#db();
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare("DELETE FROM sessions WHERE id_hash = ?")
        .run(this.#idHash(session.id));
      session.record.updatedAt = Date.now();
      this.#insert(id, session.record);
      database.exec("COMMIT");
      return { id, record: session.record };
    } catch (reason) {
      database.exec("ROLLBACK");
      throw reason;
    }
  }

  persist(session: SessionContext): void {
    session.record.updatedAt = Date.now();
    const idHash = this.#idHash(session.id);
    this.#db()
      .prepare(
        "UPDATE sessions SET payload = ?, updated_at = ? WHERE id_hash = ?",
      )
      .run(
        this.#encrypt(
          session.record,
          idHash,
          session.record.createdAt,
          session.record.updatedAt,
        ),
        session.record.updatedAt,
        idHash,
      );
  }

  delete(id: string): void {
    this.#db()
      .prepare("DELETE FROM sessions WHERE id_hash = ?")
      .run(this.#idHash(id));
  }

  purgeExpired(): void {
    this.#db()
      .prepare("DELETE FROM sessions WHERE updated_at < ?")
      .run(Date.now() - MAX_AGE_MS);
  }

  close(): void {
    this.#database?.close();
    this.#database = null;
  }

  #insert(id: string, record: SessionRecord): void {
    const idHash = this.#idHash(id);
    this.#db()
      .prepare(
        "INSERT INTO sessions(id_hash, payload, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        idHash,
        this.#encrypt(record, idHash, record.createdAt, record.updatedAt),
        record.createdAt,
        record.updatedAt,
      );
  }

  #encrypt(
    record: SessionRecord,
    idHash: string,
    createdAt: number,
    updatedAt: number,
  ): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(this.#associatedData(idHash, createdAt, updatedAt));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(record), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  #decrypt(
    payload: Uint8Array,
    idHash: string,
    createdAt: number,
    updatedAt: number,
  ): SessionRecord {
    const buffer = Buffer.from(payload);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      buffer.subarray(0, 12),
    );
    decipher.setAuthTag(buffer.subarray(12, 28));
    decipher.setAAD(this.#associatedData(idHash, createdAt, updatedAt));
    return JSON.parse(
      Buffer.concat([
        decipher.update(buffer.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as SessionRecord;
  }

  #idHash(id: string): string {
    return createHash("sha256").update(id).digest("hex");
  }

  #associatedData(
    idHash: string,
    createdAt: number,
    updatedAt: number,
  ): Buffer {
    return Buffer.from(`${idHash}:${createdAt}:${updatedAt}`, "utf8");
  }

  #db(): DatabaseSync {
    if (this.#database === null)
      throw new Error("Session repository is not initialized");
    return this.#database;
  }
}
