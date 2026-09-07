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
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMITS = {
  deezer: 30,
  youtube: 40,
  share: 10,
  events: 20,
} as const;
type RateLimitBucket = keyof typeof RATE_LIMITS;
const SHARE_ID_RETRIES = 5;
const DEEZER_API = "https://api.deezer.com";
/** Keep under Deezer signed preview URL TTL (~15 min). Search/related meta only. */
const DEEZER_EDGE_CACHE_TTL = 300;
const DEEZER_META_CACHE_TTL_SECONDS = 300;
const DEEZER_PREVIEW_EXPIRY_SKEW_SECONDS = 60;
/** v2 busts Cache API entries written before signed-preview freshness checks. */
const DEEZER_CACHE_PREFIX = "https://bingo-musical.cache/deezer/v2/";
/** Signed preview payloads must never be HTTP-cached by browsers/CDNs. */
const DEEZER_PREVIEW_CACHE_CONTROL = "private, no-store";
const YOUTUBE_CACHE_PREFIX = "https://bingo-musical.cache/youtube/";
const YOUTUBE_META_CACHE_TTL_SECONDS = 60 * 30;
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
/** Small curated list — Worker races these server-side so browsers never fan out. */
const YOUTUBE_INVIDIOUS = [
  "https://invidious.private.coffee",
  "https://invidious.materialio.us",
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
];
const YOUTUBE_PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
];

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

function errorResponse(
  request: Request,
  env: Env,
  message: string,
  status: number,
  extraHeaders?: HeadersInit
): Response {
  const response = jsonResponse(request, env, { error: message }, status);
  if (extraHeaders) {
    const headers = new Headers(extraHeaders);
    headers.forEach((value, key) => response.headers.set(key, value));
  }
  return response;
}

function rateLimitResponse(request: Request, env: Env, message: string): Response {
  return errorResponse(request, env, message, 429, { "Retry-After": String(RATE_LIMIT_WINDOW_SEC) });
}

function normalizeCacheText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deezerCacheRequest(key: string): Request {
  return new Request(`${DEEZER_CACHE_PREFIX}${key}`, { method: "GET" });
}

function deezerPreviewExpiryUnix(previewUrl: string): number | null {
  try {
    const exp = new URL(previewUrl).searchParams.get("hdnea")?.match(/(?:^|~)exp=(\d+)/)?.[1]
      ?? new URL(previewUrl).searchParams.get("exp");
    if (!exp) return null;
    const value = Number.parseInt(exp, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isDeezerPreviewUrlFresh(previewUrl: unknown, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (typeof previewUrl !== "string" || !previewUrl.trim()) return false;
  const exp = deezerPreviewExpiryUnix(previewUrl);
  // Unsigned / legacy URLs: treat as stale so we re-fetch a signed URL.
  if (exp === null) return false;
  return exp > nowSec + DEEZER_PREVIEW_EXPIRY_SKEW_SECONDS;
}

function deezerCachedTrackIsFresh(track: Record<string, unknown> | null | undefined): boolean {
  if (!track) return false;
  const previewUrl = track.previewUrl;
  if (previewUrl == null || previewUrl === "") return true;
  return isDeezerPreviewUrlFresh(previewUrl);
}

function deezerCachedPayloadIsFresh(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as { data?: unknown; previewUrl?: unknown };
  if (Array.isArray(record.data)) {
    return record.data.every((item) =>
      item && typeof item === "object"
        ? deezerCachedTrackIsFresh(item as Record<string, unknown>)
        : false
    );
  }
  return deezerCachedTrackIsFresh(record as Record<string, unknown>);
}

async function readDeezerCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await caches.default.match(deezerCacheRequest(key));
    if (!cached) return null;
    const body = await cached.json() as T;
    if (!deezerCachedPayloadIsFresh(body)) return null;
    return body;
  } catch {
    return null;
  }
}

async function writeDeezerCache(key: string, body: unknown): Promise<void> {
  try {
    const response = new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${DEEZER_META_CACHE_TTL_SECONDS}`,
      },
    });
    await caches.default.put(deezerCacheRequest(key), response);
  } catch {
    // Cache writes are best-effort; upstream results still return to the client.
  }
}

async function deezerSearchCacheKey(query: string, limit: number): Promise<string> {
  const hash = await sha256Hex(`${normalizeCacheText(query)}|${limit}`);
  return `search:${hash}`;
}

async function deezerTrackCacheKey(id: string): Promise<string> {
  return `track:${id}`;
}

/** Bypass CF edge cache — Deezer track JSON embeds short-lived signed preview URLs. */
function fetchDeezerTrackUpstream(id: string): Promise<Response> {
  return fetch(`${DEEZER_API}/track/${encodeURIComponent(id)}?cb=preview-v2`);
}

function setDeezerPreviewResponseHeaders(response: Response, cacheStatus: "HIT" | "MISS"): void {
  response.headers.set("Cache-Control", DEEZER_PREVIEW_CACHE_CONTROL);
  response.headers.set("X-Cache", cacheStatus);
}

async function deezerRelatedCacheKey(id: string, limit: number): Promise<string> {
  return `related:${id}:${limit}`;
}

function youtubeCacheRequest(key: string): Request {
  return new Request(`${YOUTUBE_CACHE_PREFIX}${key}`, { method: "GET" });
}

async function readYoutubeCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await caches.default.match(youtubeCacheRequest(key));
    if (!cached) return null;
    return (await cached.json()) as T;
  } catch {
    return null;
  }
}

async function writeYoutubeCache(key: string, body: unknown): Promise<void> {
  try {
    const response = new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`,
      },
    });
    await caches.default.put(youtubeCacheRequest(key), response);
  } catch {
    // best-effort
  }
}

async function youtubeSearchCacheKey(query: string, limit: number): Promise<string> {
  const hash = await sha256Hex(`${normalizeCacheText(query)}|${limit}`);
  return `yt-search:${hash}`;
}

async function youtubeVideoCacheKey(id: string): Promise<string> {
  return `yt-video:${id}`;
}

async function youtubeRelatedCacheKey(id: string, limit: number): Promise<string> {
  return `yt-related:${id}:${limit}`;
}

async function youtubePlaylistCacheKey(id: string): Promise<string> {
  return `yt-playlist:${id}`;
}

interface YoutubeHit {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  lengthSeconds: number;
}

function isYoutubeVideoId(id: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(id);
}

function parseYoutubeIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "https://youtube.com");
    const v = parsed.searchParams.get("v");
    if (v && isYoutubeVideoId(v)) return v;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return isYoutubeVideoId(last) ? last : null;
  } catch {
    return null;
  }
}

function thumbFromInvidious(
  item: { videoThumbnails?: Array<{ quality?: string; url?: string }>; videoId?: string }
): string {
  const thumbs = item.videoThumbnails || [];
  return (
    thumbs.find((t) => t.quality === "medium")?.url ||
    thumbs.find((t) => t.quality === "high")?.url ||
    thumbs[0]?.url ||
    (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : "")
  );
}

function mapInvidiousHit(item: {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ quality?: string; url?: string }>;
}): YoutubeHit | null {
  if (item.type && item.type !== "video" && item.type !== "shortVideo") return null;
  const videoId = item.videoId || "";
  if (!isYoutubeVideoId(videoId)) return null;
  return {
    videoId,
    title: item.title || "Untitled",
    author: item.author || "Unknown Artist",
    thumbnailUrl: thumbFromInvidious({ ...item, videoId }),
    lengthSeconds: typeof item.lengthSeconds === "number" ? item.lengthSeconds : 0,
  };
}

function mapPipedHit(item: {
  type?: string;
  url?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
}): YoutubeHit | null {
  if (item.type && item.type !== "stream" && item.type !== "video") return null;
  const videoId = parseYoutubeIdFromUrl(item.url || "") || "";
  if (!isYoutubeVideoId(videoId)) return null;
  return {
    videoId,
    title: item.title || "Untitled",
    author: item.uploaderName || "Unknown Artist",
    thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    lengthSeconds: typeof item.duration === "number" ? item.duration : 0,
  };
}

async function raceYoutubeFirst<T>(
  tasks: Array<() => Promise<T | null>>,
  concurrency = 3
): Promise<T | null> {
  if (tasks.length === 0) return null;
  const limit = Math.max(1, concurrency);
  let next = 0;
  let inFlight = 0;
  let remaining = tasks.length;
  let settled: T | null = null;
  let done = false;

  await new Promise<void>((resolve) => {
    const launch = () => {
      while (!done && inFlight < limit && next < tasks.length) {
        const task = tasks[next++];
        inFlight += 1;
        void task()
          .then((result) => {
            inFlight -= 1;
            remaining -= 1;
            if (result != null && !done) {
              settled = result;
              done = true;
              resolve();
              return;
            }
            if (remaining === 0) {
              done = true;
              resolve();
              return;
            }
            launch();
          })
          .catch(() => {
            inFlight -= 1;
            remaining -= 1;
            if (remaining === 0) {
              done = true;
              resolve();
              return;
            }
            launch();
          });
      }
    };
    launch();
  });

  return settled;
}

async function fetchJsonUpstream(url: string, timeoutMs = 4500): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchYoutubeUpstream(query: string, limit: number): Promise<YoutubeHit[] | null> {
  const tasks: Array<() => Promise<YoutubeHit[] | null>> = [
    ...YOUTUBE_PIPED.map((instance) => async () => {
      const data = await fetchJsonUpstream(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`
      );
      if (!data || typeof data !== "object") return null;
      const items = Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : Array.isArray(data)
          ? data
          : [];
      const hits = items
        .map((item) => mapPipedHit(item as Parameters<typeof mapPipedHit>[0]))
        .filter((h): h is YoutubeHit => Boolean(h));
      return hits.length > 0 ? hits.slice(0, limit) : null;
    }),
    ...YOUTUBE_INVIDIOUS.map((instance) => async () => {
      const data = await fetchJsonUpstream(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`
      );
      if (!Array.isArray(data)) return null;
      const hits = data
        .map((item) => mapInvidiousHit(item as Parameters<typeof mapInvidiousHit>[0]))
        .filter((h): h is YoutubeHit => Boolean(h));
      return hits.length > 0 ? hits.slice(0, limit) : null;
    }),
  ];
  return raceYoutubeFirst(tasks, 3);
}

async function fetchYoutubeVideoUpstream(videoId: string): Promise<YoutubeHit | null> {
  const fallback: YoutubeHit = {
    videoId,
    title: "YouTube video",
    author: "Unknown Artist",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    lengthSeconds: 180,
  };
  const tasks: Array<() => Promise<YoutubeHit | null>> = [
    ...YOUTUBE_INVIDIOUS.map((instance) => async () => {
      const data = await fetchJsonUpstream(`${instance}/api/v1/videos/${videoId}`);
      if (!data || typeof data !== "object") return null;
      return mapInvidiousHit({ ...(data as object), videoId, type: "video" } as Parameters<
        typeof mapInvidiousHit
      >[0]);
    }),
    ...YOUTUBE_PIPED.map((instance) => async () => {
      const data = await fetchJsonUpstream(`${instance}/streams/${videoId}`);
      if (!data || typeof data !== "object") return null;
      const body = data as {
        title?: string;
        uploader?: string;
        uploaderName?: string;
        thumbnailUrl?: string;
        thumbnail?: string;
        duration?: number;
      };
      return {
        videoId,
        title: body.title || fallback.title,
        author: body.uploader || body.uploaderName || fallback.author,
        thumbnailUrl: body.thumbnailUrl || body.thumbnail || fallback.thumbnailUrl,
        lengthSeconds: typeof body.duration === "number" ? body.duration : fallback.lengthSeconds,
      };
    }),
  ];
  return (await raceYoutubeFirst(tasks, 3)) || fallback;
}

async function fetchYoutubeRelatedUpstream(videoId: string, limit: number): Promise<YoutubeHit[] | null> {
  const tasks: Array<() => Promise<YoutubeHit[] | null>> = [
    ...YOUTUBE_INVIDIOUS.map((instance) => async () => {
      const data = await fetchJsonUpstream(`${instance}/api/v1/videos/${videoId}`);
      if (!data || typeof data !== "object") return null;
      const recommended = Array.isArray((data as { recommendedVideos?: unknown }).recommendedVideos)
        ? (data as { recommendedVideos: unknown[] }).recommendedVideos
        : [];
      const hits = recommended
        .map((video) => mapInvidiousHit({ ...(video as object), type: "video" } as Parameters<typeof mapInvidiousHit>[0]))
        .filter((h): h is YoutubeHit => Boolean(h))
        .filter((h) => h.videoId !== videoId);
      return hits.length > 0 ? hits.slice(0, limit) : null;
    }),
    ...YOUTUBE_PIPED.map((instance) => async () => {
      const data = await fetchJsonUpstream(`${instance}/streams/${videoId}`);
      if (!data || typeof data !== "object") return null;
      const related = Array.isArray((data as { relatedStreams?: unknown }).relatedStreams)
        ? (data as { relatedStreams: unknown[] }).relatedStreams
        : [];
      const hits = related
        .map((video) =>
          mapPipedHit({ ...(video as object), type: (video as { type?: string }).type || "stream" } as Parameters<
            typeof mapPipedHit
          >[0])
        )
        .filter((h): h is YoutubeHit => Boolean(h))
        .filter((h) => h.videoId !== videoId);
      return hits.length > 0 ? hits.slice(0, limit) : null;
    }),
  ];
  return raceYoutubeFirst(tasks, 3);
}

async function fetchYoutubePlaylistUpstream(
  playlistId: string
): Promise<{ name: string; hits: YoutubeHit[] } | null> {
  const tasks: Array<() => Promise<{ name: string; hits: YoutubeHit[] } | null>> = [
    ...YOUTUBE_INVIDIOUS.map((instance) => async () => {
      const data = await fetchJsonUpstream(
        `${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`,
        6000
      );
      if (!data || typeof data !== "object") return null;
      const videos = Array.isArray((data as { videos?: unknown }).videos)
        ? (data as { videos: unknown[] }).videos
        : [];
      const hits = videos
        .map((video) => mapInvidiousHit({ ...(video as object), type: "video" } as Parameters<typeof mapInvidiousHit>[0]))
        .filter((h): h is YoutubeHit => Boolean(h));
      if (hits.length === 0) return null;
      return {
        name: typeof (data as { title?: string }).title === "string" ? (data as { title: string }).title : "YouTube playlist",
        hits: hits.slice(0, 50),
      };
    }),
    ...YOUTUBE_PIPED.map((instance) => async () => {
      const data = await fetchJsonUpstream(
        `${instance}/playlists/${encodeURIComponent(playlistId)}`,
        6000
      );
      if (!data || typeof data !== "object") return null;
      const videos = Array.isArray((data as { relatedStreams?: unknown }).relatedStreams)
        ? (data as { relatedStreams: unknown[] }).relatedStreams
        : [];
      const hits = videos
        .map((video) => mapPipedHit({ ...(video as object), type: "stream" } as Parameters<typeof mapPipedHit>[0]))
        .filter((h): h is YoutubeHit => Boolean(h));
      if (hits.length === 0) return null;
      return {
        name: typeof (data as { name?: string }).name === "string" ? (data as { name: string }).name : "YouTube playlist",
        hits: hits.slice(0, 50),
      };
    }),
  ];
  return raceYoutubeFirst(tasks, 3);
}

async function handleYoutubeSearch(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env, "youtube"))) {
    return rateLimitResponse(request, env, "Too many YouTube search requests. Please try again later.");
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return errorResponse(request, env, "Search query is too short.", 400);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "8", 10) || 8));
  const cacheKey = await youtubeSearchCacheKey(query, limit);

  try {
    const cached = await readYoutubeCache<{ data: YoutubeHit[] }>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const hits = await searchYoutubeUpstream(query, limit);
    if (!hits) return errorResponse(request, env, "No YouTube results available right now.", 502);
    const payload = { data: hits };
    await writeYoutubeCache(cacheKey, payload);
    const response = jsonResponse(request, env, payload, 200);
    response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach YouTube search backends right now.", 502);
  }
}

async function handleYoutubeVideo(request: Request, env: Env, videoId: string): Promise<Response> {
  if (!(await checkRateLimit(request, env, "youtube"))) {
    return rateLimitResponse(request, env, "Too many YouTube requests. Please try again later.");
  }
  if (!isYoutubeVideoId(videoId)) return errorResponse(request, env, "Invalid YouTube video id.", 400);
  const cacheKey = await youtubeVideoCacheKey(videoId);

  try {
    const cached = await readYoutubeCache<YoutubeHit>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const hit = await fetchYoutubeVideoUpstream(videoId);
    if (!hit) return errorResponse(request, env, "YouTube video not found.", 404);
    await writeYoutubeCache(cacheKey, hit);
    const response = jsonResponse(request, env, hit, 200);
    response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach YouTube backends right now.", 502);
  }
}

async function handleYoutubeRelated(request: Request, env: Env, videoId: string): Promise<Response> {
  if (!(await checkRateLimit(request, env, "youtube"))) {
    return rateLimitResponse(request, env, "Too many YouTube requests. Please try again later.");
  }
  if (!isYoutubeVideoId(videoId)) return errorResponse(request, env, "Invalid YouTube video id.", 400);
  const url = new URL(request.url);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
  const cacheKey = await youtubeRelatedCacheKey(videoId, limit);

  try {
    const cached = await readYoutubeCache<{ data: YoutubeHit[] }>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const hits = await fetchYoutubeRelatedUpstream(videoId, limit);
    if (!hits) return errorResponse(request, env, "No related YouTube videos available.", 502);
    const payload = { data: hits };
    await writeYoutubeCache(cacheKey, payload);
    const response = jsonResponse(request, env, payload, 200);
    response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach YouTube backends right now.", 502);
  }
}

async function handleYoutubePlaylist(request: Request, env: Env, playlistId: string): Promise<Response> {
  if (!(await checkRateLimit(request, env, "youtube"))) {
    return rateLimitResponse(request, env, "Too many YouTube requests. Please try again later.");
  }
  if (!playlistId || playlistId.length < 6 || playlistId.length > 128) {
    return errorResponse(request, env, "Invalid YouTube playlist id.", 400);
  }
  const cacheKey = await youtubePlaylistCacheKey(playlistId);

  try {
    const cached = await readYoutubeCache<{ name: string; data: YoutubeHit[] }>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const playlist = await fetchYoutubePlaylistUpstream(playlistId);
    if (!playlist) return errorResponse(request, env, "YouTube playlist not found.", 404);
    const payload = { name: playlist.name, data: playlist.hits };
    await writeYoutubeCache(cacheKey, payload);
    const response = jsonResponse(request, env, payload, 200);
    response.headers.set("Cache-Control", `public, max-age=${YOUTUBE_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach YouTube backends right now.", 502);
  }
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
  artist?: { id?: number; name?: string };
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
  if (!(await checkRateLimit(request, env, "deezer"))) {
    return rateLimitResponse(request, env, "Too many Deezer requests. Please try again later.");
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return errorResponse(request, env, "Search query is too short.", 400);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "8", 10) || 8));
  const cacheKey = await deezerSearchCacheKey(query, limit);

  try {
    const cached = await readDeezerCache<{ data: Record<string, unknown>[]; total: number }>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${DEEZER_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const upstream = await fetch(`${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      cf: { cacheTtl: DEEZER_EDGE_CACHE_TTL, cacheEverything: true },
    });
    if (!upstream.ok) return errorResponse(request, env, `Deezer search failed (${upstream.status}).`, 502);
    const body = await upstream.json() as { data?: DeezerApiTrack[]; total?: number };
    const data = Array.isArray(body.data)
      ? body.data.map(normalizeDeezerTrack).filter((item): item is Record<string, unknown> => item !== null)
      : [];
    const payload = { data, total: body.total ?? data.length };
    await writeDeezerCache(cacheKey, payload);
    const response = jsonResponse(request, env, payload, 200);
    response.headers.set("Cache-Control", `public, max-age=${DEEZER_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach Deezer right now.", 502);
  }
}

async function searchDeezerCatalog(title: string, artist: string, id?: string): Promise<Record<string, unknown>[]> {
  if (id) {
    const cacheKey = await deezerTrackCacheKey(id);
    const cached = await readDeezerCache<Record<string, unknown>>(cacheKey);
    if (cached) return [cached];

    const upstream = await fetchDeezerTrackUpstream(id);
    if (!upstream.ok) return [];
    const item = await upstream.json() as DeezerApiTrack & { error?: unknown };
    const normalized = normalizeDeezerTrack(item);
    if (normalized) await writeDeezerCache(cacheKey, normalized);
    return normalized ? [normalized] : [];
  }

  const query = `${artist} ${title}`.trim();
  const cacheKey = await deezerSearchCacheKey(query, 8);
  const cached = await readDeezerCache<{ data: Record<string, unknown>[] }>(cacheKey);
  if (cached?.data) return cached.data;

  const upstream = await fetch(`${DEEZER_API}/search?q=${encodeURIComponent(query)}&limit=8`, {
    cf: { cacheTtl: DEEZER_EDGE_CACHE_TTL, cacheEverything: true },
  });
  if (!upstream.ok) return [];
  const body = await upstream.json() as { data?: DeezerApiTrack[] };
  const data = Array.isArray(body.data)
    ? body.data.map(normalizeDeezerTrack).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  await writeDeezerCache(cacheKey, { data, total: data.length });
  return data;
}

async function handleDeezerBatchSearch(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(request, env, "deezer"))) {
    return rateLimitResponse(request, env, "Too many Deezer requests. Please try again later.");
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
  if (!(await checkRateLimit(request, env, "deezer"))) {
    return rateLimitResponse(request, env, "Too many Deezer requests. Please try again later.");
  }
  if (!/^\d+$/.test(id)) return errorResponse(request, env, "Invalid Deezer track id.", 400);
  const cacheKey = await deezerTrackCacheKey(id);

  try {
    const cached = await readDeezerCache<Record<string, unknown>>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      setDeezerPreviewResponseHeaders(response, "HIT");
      return response;
    }

    const upstream = await fetchDeezerTrackUpstream(id);
    if (!upstream.ok) return errorResponse(request, env, "Deezer track not found.", 404);
    const item = await upstream.json() as DeezerApiTrack & { error?: unknown };
    const normalized = normalizeDeezerTrack(item);
    if (!normalized) return errorResponse(request, env, "Deezer track is unavailable.", 404);
    await writeDeezerCache(cacheKey, normalized);
    const response = jsonResponse(request, env, normalized, 200);
    setDeezerPreviewResponseHeaders(response, "MISS");
    return response;
  } catch {
    return errorResponse(request, env, "Could not reach Deezer right now.", 502);
  }
}

async function handleDeezerTrackRelated(request: Request, env: Env, id: string): Promise<Response> {
  if (!(await checkRateLimit(request, env, "deezer"))) {
    return rateLimitResponse(request, env, "Too many Deezer requests. Please try again later.");
  }
  if (!/^\d+$/.test(id)) return errorResponse(request, env, "Invalid Deezer track id.", 400);

  const url = new URL(request.url);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
  const cacheKey = await deezerRelatedCacheKey(id, limit);

  try {
    const cached = await readDeezerCache<{ data: Record<string, unknown>[]; total: number }>(cacheKey);
    if (cached) {
      const response = jsonResponse(request, env, cached, 200);
      response.headers.set("Cache-Control", `public, max-age=${DEEZER_META_CACHE_TTL_SECONDS}`);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const trackUpstream = await fetchDeezerTrackUpstream(id);
    if (!trackUpstream.ok) return errorResponse(request, env, "Deezer track not found.", 404);
    const track = await trackUpstream.json() as DeezerApiTrack & { error?: unknown };
    const artistId =
      typeof track.artist?.id === "number" || typeof track.artist?.id === "string"
        ? String(track.artist.id)
        : "";
    if (!/^\d+$/.test(artistId)) {
      return errorResponse(request, env, "Could not resolve the artist for that track.", 404);
    }

    const radioUpstream = await fetch(
      `${DEEZER_API}/artist/${encodeURIComponent(artistId)}/radio?limit=${limit}`,
      { cf: { cacheTtl: DEEZER_EDGE_CACHE_TTL, cacheEverything: true } }
    );
    if (!radioUpstream.ok) {
      return errorResponse(request, env, `Deezer artist radio failed (${radioUpstream.status}).`, 502);
    }
    const body = await radioUpstream.json() as { data?: DeezerApiTrack[] };
    const data = Array.isArray(body.data)
      ? body.data
          .map(normalizeDeezerTrack)
          .filter((item): item is Record<string, unknown> => item !== null)
          .filter((item) => item.id !== id)
          .slice(0, limit)
      : [];
    const payload = { data, total: data.length };
    await writeDeezerCache(cacheKey, payload);
    const response = jsonResponse(request, env, payload, 200);
    response.headers.set("Cache-Control", `public, max-age=${DEEZER_META_CACHE_TTL_SECONDS}`);
    response.headers.set("X-Cache", "MISS");
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

async function checkRateLimit(request: Request, env: Env, bucket: RateLimitBucket): Promise<boolean> {
  const ip = getClientIp(request);
  const window = Math.floor(Date.now() / 60000);
  const key = `${RATE_LIMIT_PREFIX}${bucket}:${ip}:${window}`;
  const max = RATE_LIMITS[bucket];
  const current = await env.SHARED_DECKS.get(key);
  const count = current ? Number.parseInt(current, 10) : 0;
  if (!Number.isFinite(count) || count >= max) {
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
  if (!(await checkRateLimit(request, env, "share"))) {
    return rateLimitResponse(request, env, "Too many share requests. Please try again later.");
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
  if (!(await checkRateLimit(request, env, "events"))) {
    return rateLimitResponse(request, env, "Too many requests. Please try again later.");
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

    if (url.pathname === "/api/youtube/search" && request.method === "GET") {
      return handleYoutubeSearch(request, env);
    }

    const youtubeVideoMatch = url.pathname.match(/^\/api\/youtube\/video\/([^/]+)$/);
    if (youtubeVideoMatch && request.method === "GET") {
      return handleYoutubeVideo(request, env, decodeURIComponent(youtubeVideoMatch[1]));
    }

    const youtubeRelatedMatch = url.pathname.match(/^\/api\/youtube\/related\/([^/]+)$/);
    if (youtubeRelatedMatch && request.method === "GET") {
      return handleYoutubeRelated(request, env, decodeURIComponent(youtubeRelatedMatch[1]));
    }

    const youtubePlaylistMatch = url.pathname.match(/^\/api\/youtube\/playlist\/([^/]+)$/);
    if (youtubePlaylistMatch && request.method === "GET") {
      return handleYoutubePlaylist(request, env, decodeURIComponent(youtubePlaylistMatch[1]));
    }

    const deezerTrackRelatedMatch = url.pathname.match(/^\/api\/deezer\/track\/([^/]+)\/related$/);
    if (deezerTrackRelatedMatch && request.method === "GET") {
      return handleDeezerTrackRelated(
        request,
        env,
        decodeURIComponent(deezerTrackRelatedMatch[1])
      );
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
