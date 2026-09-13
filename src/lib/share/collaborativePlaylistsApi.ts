import { MusicProvider, Track } from "../../types/deck";

const API_URL = (import.meta.env.VITE_SHARE_API_URL ?? "").replace(/\/$/, "");

export interface CollaborativePlaylist {
  id: string;
  format: "bingo-musical-collaboration";
  schemaVersion: 1;
  name: string;
  provider: MusicProvider;
  revision: number;
  updatedAt: string;
  tracks: Track[];
}

export interface CreateCollaborativePlaylistResponse {
  collaborationId: string;
  revision: number;
  playlist: CollaborativePlaylist;
}

export interface AppendTracksResponse {
  changed: boolean;
  revision: number;
  playlist: CollaborativePlaylist;
  addedTrackIds?: string[];
  duplicateTrackIds?: string[];
}

export class CollaborativeApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CollaborativeApiError";
    this.status = status;
    this.code = code;
  }
}

export function isCollaborativeApiConfigured(): boolean {
  return Boolean(API_URL);
}

function requireApiUrl(): string {
  if (!API_URL) throw new Error("Collaborative playlists are unavailable until the share service is configured.");
  return API_URL;
}

function operationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Keep the status-based error below.
  }
  if (!response.ok) {
    const data = body as { error?: string; code?: string } | null;
    throw new CollaborativeApiError(
      data?.error || `Collaborative playlist request failed (${response.status}).`,
      response.status,
      data?.code,
    );
  }
  return body as T;
}

export function createCollaborativePlaylist(input: {
  name: string;
  provider: MusicProvider;
  tracks?: Track[];
}): Promise<CreateCollaborativePlaylistResponse> {
  return request<CreateCollaborativePlaylistResponse>("/api/collaborations", {
    method: "POST",
    body: JSON.stringify({ name: input.name, provider: input.provider, tracks: input.tracks ?? [] }),
  });
}

export function fetchCollaborativePlaylist(id: string): Promise<CollaborativePlaylist> {
  return request<CollaborativePlaylist>(`/api/collaborations/${encodeURIComponent(id)}`);
}

export function appendCollaborativeTracks(
  id: string,
  baseRevision: number,
  tracks: Track[],
): Promise<AppendTracksResponse> {
  return request<AppendTracksResponse>(`/api/collaborations/${encodeURIComponent(id)}/tracks`, {
    method: "POST",
    body: JSON.stringify({ operationId: operationId(), baseRevision, tracks }),
  });
}
