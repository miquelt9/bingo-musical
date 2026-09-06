import {
  canonicalizeSharePayload,
  canonicalPayloadsEqual,
  computeShareId,
} from "../../src/lib/share/deckCanonical";

export interface Env {
  SHARED_DECKS: KVNamespace;
  USAGE_EVENTS?: AnalyticsEngineDataset;
  /** Comma-separated browser origins allowed for CORS (e.g. https://user.github.io). */
  ALLOWED_ORIGINS?: string;
}

const SHARE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,12}$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENT_BODY_BYTES = 512;
const MAX_DEEZER_BATCH_BODY_BYTES = 32 * 1024;
const MAX_DEEZER_BATCH_SONGS = 40;
const MAX_SONGS = 150;
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365;
const SHARE_KEY_PREFIX = "share:";
const RATE_LIMIT_PREFIX = "rl:";
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_SEC = 60;
const SHARE_ID_RETRIES = 5;
const DEEZER_API = "https://api.deezer.com";

const ALLOWED_EVENTS = new Set([
  "host_started",
  "cards_printed",
  "deck_imported",
  "page_view",
]);

const ALLOWED_ROUTE_LABELS = new Set([
  "home",
  "editor",
  "cards",
  "host",
  "import",
  "share",
  "settings",
]);

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://miquelt9.github.io",
];

const SHARE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function getAllowedOrigins(env: Env): string[] {
  const configured = env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && getAllowedOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  status = 200
): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function emptyResponse(request: Request, env: Env, status = 204): Response {
  return new Response(null, {
    status,
    headers: corsHeaders(request, env),
  });
}

function errorResponse(request: Request, env: Env, message: string, status: number): Response {
  return jsonResponse(request, env, { error: message }, status);
}

function trackUsageEvent(env: Env, event: string, route?: string): void {
  if (!env.USAGE_EVENTS) return;

  const blobs = route ? [event, route] : [event];
  env.USAGE_EVENTS.writeDataPoint({
    blobs,
    doubles: [],
    indexes: [],
  });
}

function generateShareId(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += SHARE_ALPHABET[bytes[i] % SHARE_ALPHABET.length];
  }
  return id;
}

function isValidSharePayload(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;
  if (obj.format !== "bingo-musical-deck") {
    return false;
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return false;
  }

  const songs = Array.isArray(obj.songs) ? obj.songs : null;
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : null;
  const songCount = songs?.length ?? tracks?.length ?? 0;
  return songCount > 0 && songCount <= MAX_SONGS;
}

interface DeezerApiTrack {
  id?: number;
  title?: string;
  duration?: number;
  preview?: string;
  link?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string; cover_small?: string };
}

interface DeezerBatchSong {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
}

function normalizeDeezerTrack(item: DeezerApiTrack): Record<string, unknown> | null {
  const id = typeof item.id === "number" || typeof item.id === "string" ? String(item.id) : "";
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const artist = typeof item.artist?.name === "string" ? item.artist.name.trim() : "";
  if (!/^\d+$/.test(id) || !title || !artist) return null;
  const previewUrl = typeof item.preview === "string" && /^https:\/\//i.test(item.preview)
    ? item.preview
    : null;
  return {
    provider: "deezer",
    id,
    title,
    artist,
    album: typeof item.album?.title === "string" ? item.album.title : "",
    albumArtUrl: item.album?.cover_medium || item.album?.cover_small || "",
    durationMs: typeof item.duration === "number" && item.duration > 0 ? item.duration * 1000 : 180000,
    previewUrl,
    previewDurationMs: previewUrl ? 30000 : 0,
    providerUrl: typeof item.link === "string" ? item.link : `https://www.deezer.com/track/${id}`,
  };
}

async function handleDeezerSearch(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env))) {
    return errorResponse(request, env, "Too many Deezer requests. Please try again later.", 429);
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return errorResponse(request, env, "Search query is too short.", 400);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "8", 10) || 8));

  try {
    const upstream = await fetch(`${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!upstream.ok) return errorResponse(request, env, `Deezer search failed (${upstream.status}).`, 502);
    const body = await upstream.json() as { data?: DeezerApiTrack[]; total?: number };
    const data = Array.isArray(body.data)
      ? body.data.map(normalizeDeezerTrack).filter((item): item is Record<string, unknown> => item !== null)
      : [];
    const response = jsonResponse(request, env, { data, total: body.total ?? data.length }, 200);
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach Deezer right now.", 502);
  }
}

async function searchDeezerCatalog(title: string, artist: string, id?: string): Promise<Record<string, unknown>[]> {
  if (id) {
    const upstream = await fetch(`${DEEZER_API}/track/${encodeURIComponent(id)}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!upstream.ok) return [];
    const item = await upstream.json() as DeezerApiTrack & { error?: unknown };
    const normalized = normalizeDeezerTrack(item);
    return normalized ? [normalized] : [];
  }

  const query = `${artist} ${title}`.trim();
  const upstream = await fetch(`${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=8`, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!upstream.ok) return [];
  const body = await upstream.json() as { data?: DeezerApiTrack[] };
  return Array.isArray(body.data)
    ? body.data.map(normalizeDeezerTrack).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

async function handleDeezerBatchSearch(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env))) {
    return errorResponse(request, env, "Too many Deezer requests. Please try again later.", 429);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_DEEZER_BATCH_BODY_BYTES) {
    return errorResponse(request, env, "Deezer batch payload is too large.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, env, "Invalid JSON body.", 400);
  }

  const songs = body && typeof body === "object" && Array.isArray((body as { songs?: unknown }).songs)
    ? (body as { songs: DeezerBatchSong[] }).songs
    : null;
  if (!songs || songs.length === 0 || songs.length > MAX_DEEZER_BATCH_SONGS) {
    return errorResponse(request, env, `Include between 1 and ${MAX_DEEZER_BATCH_SONGS} songs.`, 400);
  }

  const queries = songs.map((song) => ({
    id: typeof song.id === "string" ? song.id.trim() : "",
    title: typeof song.title === "string" ? song.title.trim() : "",
    artist: typeof song.artist === "string" ? song.artist.trim() : "",
  }));
  if (queries.some((song) => (song.id && !/^\d+$/.test(song.id)) || song.title.length < 1 || song.artist.length < 1 || song.title.length > 200 || song.artist.length > 200)) {
    return errorResponse(request, env, "Each song needs a valid title and artist.", 400);
  }

  try {
    const results: Record<string, unknown>[][] = Array.from({ length: queries.length }, () => []);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queries.length) {
        const index = cursor++;
        results[index] = await searchDeezerCatalog(queries[index].title, queries[index].artist, queries[index].id || undefined);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, queries.length) }, worker));

    const response = jsonResponse(request, env, { data: results }, 200);
    response.headers.set("Cache-Control", "private, max-age=300");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach Deezer right now.", 502);
  }
}

async function handleDeezerTrack(request: Request, env: Env, id: string): Promise<Response> {
  if (!(await checkRateLimit(request, env))) {
    return errorResponse(request, env, "Too many Deezer requests. Please try again later.", 429);
  }
  if (!/^\d+$/.test(id)) return errorResponse(request, env, "Invalid Deezer track id.", 400);

  try {
    const upstream = await fetch(`${DEEZER_API}/track/${encodeURIComponent(id)}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!upstream.ok) return errorResponse(request, env, "Deezer track not found.", 404);
    const item = await upstream.json() as DeezerApiTrack & { error?: unknown };
    const normalized = normalizeDeezerTrack(item);
    if (!normalized) return errorResponse(request, env, "Deezer track is unavailable.", 404);
    const response = jsonResponse(request, env, normalized, 200);
    response.headers.set("Cache-Control", "public, max-age=300");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach Deezer right now.", 502);
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function checkRateLimit(request: Request, env: Env): Promise<boolean> {
  const ip = getClientIp(request);
  const window = Math.floor(Date.now() / 60000);
  const key = `${RATE_LIMIT_PREFIX}${ip}:${window}`;
  const current = await env.SHARED_DECKS.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  if (!Number.isFinite(count) || count >= RATE_LIMIT_MAX) {
    return false;
  }
  await env.SHARED_DECKS.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  return true;
}

async function allocateShareId(env: Env, serialized: string): Promise<string | null> {
  for (let attempt = 0; attempt < SHARE_ID_RETRIES; attempt++) {
    const shareId = generateShareId();
    const key = `${SHARE_KEY_PREFIX}${shareId}`;
    const existing = await env.SHARED_DECKS.get(key);
    if (existing) continue;

    await env.SHARED_DECKS.put(key, serialized, {
      expirationTtl: SHARE_TTL_SECONDS,
    });
    return shareId;
  }
  return null;
}

async function allocateContentAddressedShareId(
  env: Env,
  payload: Record<string, unknown>,
  serialized: string
): Promise<{ shareId: string; created: boolean } | null> {
  const canonical = canonicalizeSharePayload(payload);
  if (!canonical) {
    return null;
  }

  const shareId = await computeShareId(canonical);
  const key = `${SHARE_KEY_PREFIX}${shareId}`;
  const existing = await env.SHARED_DECKS.get(key);

  if (existing) {
    try {
      const existingPayload = JSON.parse(existing) as unknown;
      const existingCanonical = canonicalizeSharePayload(existingPayload);
      if (existingCanonical && canonicalPayloadsEqual(existingCanonical, canonical)) {
        return { shareId, created: false };
      }
    } catch {
      // Fall through to random-id allocation on corrupted stored payload.
    }

    const fallbackShareId = await allocateShareId(env, serialized);
    if (!fallbackShareId) {
      return null;
    }
    return { shareId: fallbackShareId, created: true };
  }

  await env.SHARED_DECKS.put(key, serialized, {
    expirationTtl: SHARE_TTL_SECONDS,
  });
  return { shareId, created: true };
}

async function handleCreateDeck(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env))) {
    return errorResponse(request, env, "Too many share requests. Please try again later.", 429);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(request, env, "Deck payload is too large.", 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, env, "Invalid JSON body.", 400);
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_BODY_BYTES) {
    return errorResponse(request, env, "Deck payload is too large.", 413);
  }

  if (!isValidSharePayload(payload)) {
    return errorResponse(request, env, "Invalid deck payload.", 400);
  }

  const result = await allocateContentAddressedShareId(env, payload, serialized);
  if (!result) {
    return errorResponse(request, env, "Could not create share link. Please try again.", 503);
  }

  trackUsageEvent(env, result.created ? "share_created" : "share_deduplicated");
  return jsonResponse(request, env, { shareId: result.shareId }, result.created ? 201 : 200);
}

async function handleGetDeck(request: Request, env: Env, shareId: string): Promise<Response> {
  if (!SHARE_ID_PATTERN.test(shareId)) {
    return errorResponse(request, env, "Invalid share id.", 400);
  }

  const stored = await env.SHARED_DECKS.get(`${SHARE_KEY_PREFIX}${shareId}`);
  if (!stored) {
    trackUsageEvent(env, "share_not_found");
    return errorResponse(request, env, "Shared deck not found.", 404);
  }

  try {
    const payload = JSON.parse(stored);
    trackUsageEvent(env, "share_opened");
    return jsonResponse(request, env, payload, 200);
  } catch {
    return errorResponse(request, env, "Stored deck is corrupted.", 500);
  }
}

async function handleTrackEvent(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env))) {
    return errorResponse(request, env, "Too many requests. Please try again later.", 429);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_EVENT_BODY_BYTES) {
    return errorResponse(request, env, "Event payload is too large.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, env, "Invalid JSON body.", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse(request, env, "Invalid event payload.", 400);
  }

  const { event, route } = body as { event?: unknown; route?: unknown };
  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return errorResponse(request, env, "Invalid event.", 400);
  }

  if (route !== undefined) {
    if (typeof route !== "string" || !ALLOWED_ROUTE_LABELS.has(route)) {
      return errorResponse(request, env, "Invalid route.", 400);
    }
    trackUsageEvent(env, event, route);
  } else {
    trackUsageEvent(env, event);
  }

  return emptyResponse(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (url.pathname === "/api/decks" && request.method === "POST") {
      return handleCreateDeck(request, env);
    }

    const match = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (match && request.method === "GET") {
      return handleGetDeck(request, env, decodeURIComponent(match[1]));
    }

    if (url.pathname === "/api/deezer/search" && request.method === "GET") {
      return handleDeezerSearch(request, env);
    }

    if (url.pathname === "/api/deezer/batch-search" && request.method === "POST") {
      return handleDeezerBatchSearch(request, env);
    }

    const deezerTrackMatch = url.pathname.match(/^\/api\/deezer\/track\/([^/]+)$/);
    if (deezerTrackMatch && request.method === "GET") {
      return handleDeezerTrack(request, env, decodeURIComponent(deezerTrackMatch[1]));
    }

    if (url.pathname === "/api/events" && request.method === "POST") {
      return handleTrackEvent(request, env);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse(request, env, { ok: true }, 200);
    }

    return errorResponse(request, env, "Not found.", 404);
  },
};
