import type { IncomingMessage, ServerResponse } from "node:http";

export interface PendingPin {
  readonly id: number;
  readonly code: string;
  readonly createdAt: number;
}

export interface ServerConnection {
  readonly uri: string;
  readonly token: string;
}

export interface SessionRecord {
  readonly createdAt: number;
  updatedAt: number;
  pendingPin?: PendingPin;
  token?: string;
  account?: PlexAccountDto;
  servers: Record<string, readonly ServerConnection[]>;
}

export type SessionStore = Record<string, SessionRecord>;

export interface SessionContext {
  readonly id: string;
  readonly record: SessionRecord;
}

export interface RequestContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
}

export interface PlexPinResponse {
  readonly id: number;
  readonly code: string;
  readonly authToken?: string | null;
}

export interface PlexConnectionResponse {
  readonly uri: string;
  readonly local?: boolean;
  readonly relay?: boolean;
}

export interface PlexResourceResponse {
  readonly name: string;
  readonly provides: string;
  readonly accessToken?: string;
  readonly connections: readonly PlexConnectionResponse[];
}

export interface PlexAccountDto {
  readonly uuid: string;
  readonly username?: string | null;
  readonly title?: string | null;
}
