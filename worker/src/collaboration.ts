/// <reference types="@cloudflare/workers-types" />

export interface CollaborationEnv {
  SHARED_DECKS: KVNamespace;
}

export interface CollaborationTrack {
  provider: "youtube" | "deezer";
  id: string;
  title: string;
  artist: string;
  [key: string]: unknown;
}

export interface CollaborationPlaylist {
  format: "bingo-musical-collaboration";
  schemaVersion: 1;
  id: string;
  name: string;
  provider: "youtube" | "deezer";
  revision: number;
  updatedAt: string;
  tracks: CollaborationTrack[];
}

export interface TrackMutationResult {
  changed: boolean;
  revision: number;
  playlist: CollaborationPlaylist;
  addedTrackIds: string[];
  duplicateTrackIds: string[];
}

const COLLAB_KEY_PREFIX = "collab:";
const COLLAB_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_COLLAB_BODY_BYTES = 256 * 1024;
const MAX_COLLAB_TRACKS = 150;
const MAX_NAME_LENGTH = 200;
const MAX_TRACK_TEXT_LENGTH = 500;
const MAX_OPERATION_ID_LENGTH = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TRACK_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function provider(value: unknown): "youtube" | "deezer" | null {
  return value === "youtube" || value === "deezer" ? value : null;
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function mediaId(track: CollaborationTrack): string | null {
  const media = record(track.media) ? track.media : null;
  const explicitId = text(media?.id, 256) ?? text(track.providerId, 256) ?? text(track.providerMediaId, 256);
  const legacyId = track.provider === "youtube" && typeof track.youtubeVideoId === "string"
    ? text(track.youtubeVideoId, 256)
    : track.provider === "deezer" && typeof track.deezerId === "string"
      ? text(track.deezerId, 256)
      : null;
  return explicitId ?? legacyId ?? text(track.id, 256);
}

function trackKeys(track: CollaborationTrack): string[] {
  const keys = [`text:${track.provider}:${normalizeText(track.artist)}\u0000${normalizeText(track.title)}`];
  const id = mediaId(track);
  if (id) keys.unshift(`media:${track.provider}:${id.toLocaleLowerCase()}`);
  return keys;
}

function normalizeTrack(raw: unknown, playlistProvider: "youtube" | "deezer"): CollaborationTrack | null {
  if (!record(raw)) return null;
  const title = text(raw.title);
  const artist = text(raw.artist);
  if (!title || !artist) return null;

  const trackProvider = provider(raw.provider) ?? playlistProvider;
  if (trackProvider !== playlistProvider) return null;
  const media = record(raw.media) ? raw.media : null;
  const stableId = text(media?.id, 256) ?? text(raw.providerId, 256) ?? text(raw.providerMediaId, 256)
    ?? (playlistProvider === "youtube" ? text(raw.youtubeVideoId, 256) : text(raw.deezerId, 256))
    ?? text(raw.id, 256);
  if (!stableId) return null;

  return { ...raw, provider: playlistProvider, id: stableId, title, artist };
}

function normalizeTracks(raw: unknown, playlistProvider: "youtube" | "deezer", allowEmpty = false): CollaborationTrack[] | null {
  if (!Array.isArray(raw) || (!allowEmpty && raw.length === 0) || raw.length > MAX_COLLAB_TRACKS) return null;
  const tracks = raw.map((item) => normalizeTrack(item, playlistProvider));
  return tracks.every((item): item is CollaborationTrack => item !== null) ? tracks : null;
}

function playlistFromInput(input: unknown, id: string, now = new Date().toISOString(), allowEmpty = false): CollaborationPlaylist | null {
  if (!record(input)) return null;
  const name = text(input.name, MAX_NAME_LENGTH);
  const playlistProvider = provider(input.provider);
  if (!name || !playlistProvider) return null;
  const source = Array.isArray(input.tracks) ? input.tracks : input.songs;
  const tracks = normalizeTracks(source, playlistProvider, allowEmpty);
  if (!tracks) return null;

  const unique = new Set<string>();
  for (const track of tracks) {
    if (trackKeys(track).some((key) => unique.has(key))) return null;
    trackKeys(track).forEach((key) => unique.add(key));
  }
  return {
    format: "bingo-musical-collaboration",
    schemaVersion: 1,
    id,
    name,
    provider: playlistProvider,
    revision: 0,
    updatedAt: now,
    tracks,
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCollaborationId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function collaborationKey(id: string): string {
  return `${COLLAB_KEY_PREFIX}${id}`;
}

export function isValidCollaborationId(id: string): boolean {
  return COLLAB_ID_PATTERN.test(id);
}

export function collaborationBodyTooLarge(request: Request): boolean {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  return contentLength > MAX_COLLAB_BODY_BYTES;
}

export function parseCollaborationCreate(input: unknown, id: string): CollaborationPlaylist | null {
  const playlist = playlistFromInput(input, id);
  if (!playlist || JSON.stringify(playlist).length > MAX_COLLAB_BODY_BYTES) return null;
  return playlist;
}

async function readPlaylist(env: CollaborationEnv, id: string): Promise<CollaborationPlaylist | null> {
  const stored = await env.SHARED_DECKS.get(collaborationKey(id));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as CollaborationPlaylist;
    return parsed.format === "bingo-musical-collaboration" && parsed.schemaVersion === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export async function handleCreateCollaboration(request: Request, env: CollaborationEnv): Promise<Response> {
  if (collaborationBodyTooLarge(request)) return error("Collaboration payload is too large.", 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body.", 400);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generateCollaborationId();
    const playlist = parseCollaborationCreate(body, id);
    if (!playlist) return error("Invalid collaboration payload.", 400);
    if (await readPlaylist(env, id)) continue;
    try {
      await env.SHARED_DECKS.put(collaborationKey(id), JSON.stringify(playlist));
      return json({ collaborationId: id, revision: playlist.revision, playlist }, 201);
    } catch {
      return error("Could not create collaboration.", 503);
    }
  }
  return error("Could not create collaboration.", 503);
}

export async function handleGetCollaboration(env: CollaborationEnv, id: string): Promise<Response> {
  const playlist = await readPlaylist(env, id);
  return playlist ? json(playlist) : error("Collaboration not found.", 404);
}

export async function handleUpdateCollaboration(request: Request, env: CollaborationEnv, id: string): Promise<Response> {
  const current = await readPlaylist(env, id);
  if (!current) return error("Collaboration not found.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid collaboration payload.", 400);
  }
  if (!record(body) || typeof body.baseRevision !== "number" || !Number.isInteger(body.baseRevision) || body.baseRevision < 0) {
    return error("baseRevision is required.", 400);
  }
  if (body.baseRevision !== current.revision) return error("Collaboration revision is stale.", 409);

  const next = playlistFromInput(body, id, current.updatedAt, true);
  if (!next || next.provider !== current.provider) return error("Invalid collaboration payload.", 400);

  const unchanged = next.name === current.name && JSON.stringify(next.tracks) === JSON.stringify(current.tracks);
  if (unchanged) {
    return json({ changed: false, revision: current.revision, playlist: current });
  }

  const updated: CollaborationPlaylist = {
    ...current,
    name: next.name,
    tracks: next.tracks,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  try {
    await env.SHARED_DECKS.put(collaborationKey(id), JSON.stringify(updated));
  } catch {
    return error("Could not persist collaboration.", 503);
  }
  return json({ changed: true, revision: updated.revision, playlist: updated });
}

export async function handleAppendTracks(request: Request, env: CollaborationEnv, id: string): Promise<Response> {
  const playlist = await readPlaylist(env, id);
  if (!playlist) return error("Collaboration not found.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body.", 400);
  }
  if (!record(body)) return error("Invalid tracks payload.", 400);
  const operationId = text(body.operationId, MAX_OPERATION_ID_LENGTH);
  const baseRevision = body.baseRevision;
  if (!operationId || typeof baseRevision !== "number" || !Number.isInteger(baseRevision) || baseRevision < 0) {
    return error("operationId and baseRevision are required.", 400);
  }
  if (baseRevision !== playlist.revision) return error("Collaboration revision is stale.", 409);

  const tracks = normalizeTracks(body.tracks, playlist.provider);
  if (!tracks) return error("Invalid tracks payload.", 400);

  const existing = new Set(playlist.tracks.flatMap(trackKeys));
  const batch = new Set<string>();
  const addedTrackIds: string[] = [];
  const duplicateTrackIds: string[] = [];
  const added: CollaborationTrack[] = [];
  for (const track of tracks) {
    const keys = trackKeys(track);
    if (keys.some((key) => existing.has(key) || batch.has(key))) {
      duplicateTrackIds.push(track.id);
    } else {
      keys.forEach((key) => batch.add(key));
      added.push(track);
      addedTrackIds.push(track.id);
    }
  }

  if (added.length === 0) {
    return json({ changed: false, revision: playlist.revision, playlist, addedTrackIds, duplicateTrackIds });
  }

  const nextPlaylist: CollaborationPlaylist = {
    ...playlist,
    revision: playlist.revision + 1,
    updatedAt: new Date().toISOString(),
    tracks: [...added, ...playlist.tracks],
  };
  try {
    await env.SHARED_DECKS.put(collaborationKey(id), JSON.stringify(nextPlaylist));
  } catch {
    return error("Could not persist collaboration.", 503);
  }
  const result: TrackMutationResult = {
    changed: true,
    revision: nextPlaylist.revision,
    playlist: nextPlaylist,
    addedTrackIds,
    duplicateTrackIds,
  };
  return json(result);
}
