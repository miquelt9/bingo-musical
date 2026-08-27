import { Track } from "../../types/deck";
import { YoutubeSearchHit } from "./search";
import { loadYoutubeApi } from "./player";

export interface EmbedValidationResult {
  videoId: string;
  embeddable: boolean;
  reason?: string;
  errorCode?: number;
  checkedAt: number;
}

const CACHE_STORAGE_KEY = "mb_yt_embed_cache_v1";
const CACHE_TTL_VALID_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for valid
const CACHE_TTL_INVALID_MS = 24 * 60 * 60 * 1000; // 24 hours for invalid

// In-memory cache
const memoryCache = new Map<string, EmbedValidationResult>();

// Load localStorage cache on module init
function loadCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, EmbedValidationResult>;
    const now = Date.now();
    for (const [vid, item] of Object.entries(parsed)) {
      const ttl = item.embeddable ? CACHE_TTL_VALID_MS : CACHE_TTL_INVALID_MS;
      if (now - item.checkedAt < ttl) {
        memoryCache.set(vid, item);
      }
    }
  } catch {
    // Ignore storage parse issues
  }
}

function saveCache(): void {
  try {
    const obj: Record<string, EmbedValidationResult> = {};
    const now = Date.now();
    for (const [vid, item] of memoryCache.entries()) {
      const ttl = item.embeddable ? CACHE_TTL_VALID_MS : CACHE_TTL_INVALID_MS;
      if (now - item.checkedAt < ttl) {
        obj[vid] = item;
      }
    }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota issues
  }
}

loadCache();

export function getCachedEmbedStatus(videoId: string): EmbedValidationResult | null {
  if (!videoId) return null;
  const cached = memoryCache.get(videoId);
  if (!cached) return null;
  const now = Date.now();
  const ttl = cached.embeddable ? CACHE_TTL_VALID_MS : CACHE_TTL_INVALID_MS;
  if (now - cached.checkedAt >= ttl) {
    memoryCache.delete(videoId);
    return null;
  }
  return cached;
}

export function markVideoEmbedBlocked(videoId: string, reason = "Embedding disabled by video owner"): void {
  if (!videoId) return;
  const entry: EmbedValidationResult = {
    videoId,
    embeddable: false,
    reason,
    errorCode: 150,
    checkedAt: Date.now(),
  };
  memoryCache.set(videoId, entry);
  saveCache();
}

/**
 * Fast verification using noembed oEmbed service with CORS support.
 */
async function checkWithOEmbed(videoId: string): Promise<EmbedValidationResult> {
  const url = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        videoId,
        embeddable: false,
        reason: `Video not found or embedding restricted (HTTP ${res.status})`,
        checkedAt: Date.now(),
      };
    }

    const data = await res.json();
    if (data.error) {
      return {
        videoId,
        embeddable: false,
        reason: data.error || "Embedding not allowed for this video",
        checkedAt: Date.now(),
      };
    }

    if (data.html && typeof data.html === "string" && data.html.includes("iframe")) {
      return {
        videoId,
        embeddable: true,
        checkedAt: Date.now(),
      };
    }

    return {
      videoId,
      embeddable: false,
      reason: "No iframe embed available for this video",
      checkedAt: Date.now(),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    // If noembed is unreachable or network error, fallback to headless player probe
    throw err;
  }
}

/**
 * Headless YouTube IFrame player verification probe.
 * Spawns a hidden player element to test if YouTube's API allows embedding.
 */
function probeVideoWithPlayer(videoId: string, timeoutMs = 4500): Promise<EmbedValidationResult> {
  return new Promise(async (resolve) => {
    try {
      await loadYoutubeApi();
    } catch {
      // If API fails to load, assume ok with timeout fallback
      return resolve({
        videoId,
        embeddable: true,
        reason: "YouTube API check fallback",
        checkedAt: Date.now(),
      });
    }

    if (!window.YT || !window.YT.Player) {
      return resolve({
        videoId,
        embeddable: true,
        reason: "YouTube API not available",
        checkedAt: Date.now(),
      });
    }

    const containerId = `yt-probe-${Math.random().toString(36).substring(2, 9)}`;
    const container = document.createElement("div");
    container.id = containerId;
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-100;";
    document.body.appendChild(container);

    let probePlayer: YT.Player | null = null;
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        probePlayer?.destroy();
      } catch {
        // ignore
      }
      try {
        container.remove();
      } catch {
        // ignore
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        videoId,
        embeddable: true, // If it doesn't fail with error in 4.5s, it is likely playable
        reason: "Probe timed out without error",
        checkedAt: Date.now(),
      });
    }, timeoutMs);

    try {
      probePlayer = new window.YT.Player(containerId, {
        width: "200",
        height: "200",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            clearTimeout(timeout);
            cleanup();
            resolve({
              videoId,
              embeddable: true,
              checkedAt: Date.now(),
            });
          },
          onError: (e) => {
            clearTimeout(timeout);
            cleanup();
            const code = e.data;
            let reason = "Embedding blocked by video owner (Error 150/101)";
            if (code === 100) reason = "Video not found or deleted (Error 100)";
            if (code === 2) reason = "Invalid video ID parameter (Error 2)";
            if ((code as unknown as number) === 153) reason = "Embedder identification blocked (Error 153)";

            resolve({
              videoId,
              embeddable: false,
              errorCode: code,
              reason,
              checkedAt: Date.now(),
            });
          },
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      cleanup();
      resolve({
        videoId,
        embeddable: false,
        reason: (err as Error).message || "Failed to initialize player probe",
        checkedAt: Date.now(),
      });
    }
  });
}

/**
 * Checks if a single YouTube video ID supports embedding.
 * Uses cached result if available, then fast oEmbed check, falling back to IFrame player probe.
 */
export async function checkVideoEmbeddable(
  videoId: string,
  forceProbe = false
): Promise<EmbedValidationResult> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      videoId,
      embeddable: false,
      reason: "Invalid YouTube video ID format",
      checkedAt: Date.now(),
    };
  }

  if (!forceProbe) {
    const cached = getCachedEmbedStatus(videoId);
    if (cached) return cached;
  }

  let result: EmbedValidationResult;
  try {
    result = await checkWithOEmbed(videoId);
    // If oEmbed returns valid, double-check probe if forceProbe was requested
    if (result.embeddable && forceProbe) {
      result = await probeVideoWithPlayer(videoId);
    }
  } catch {
    // If oEmbed failed/network error, probe directly via YouTube IFrame API
    result = await probeVideoWithPlayer(videoId);
  }

  memoryCache.set(videoId, result);
  saveCache();
  return result;
}

/**
 * Given a list of candidate YouTube search hits, finds the first one that allows embedding.
 * Automatically avoids hits where embedding has been disabled.
 */
export async function findFirstEmbeddableHit(
  hits: YoutubeSearchHit[]
): Promise<YoutubeSearchHit | null> {
  for (const hit of hits) {
    const res = await checkVideoEmbeddable(hit.videoId);
    if (res.embeddable) {
      return hit;
    }
  }
  return null;
}

export interface BatchValidationProgress {
  total: number;
  completed: number;
  valid: number;
  invalid: number;
  currentTrackTitle?: string;
}

/**
 * Validates a list of tracks for YouTube embeddability with concurrency.
 */
export async function validateTracksEmbeddability(
  tracks: Track[],
  concurrency = 3,
  onProgress?: (progress: BatchValidationProgress, result: EmbedValidationResult, track: Track) => void,
  shouldCancel?: () => boolean
): Promise<{
  validTracks: Track[];
  invalidTracks: Array<{ track: Track; validation: EmbedValidationResult }>;
}> {
  const validTracks: Track[] = [];
  const invalidTracks: Array<{ track: Track; validation: EmbedValidationResult }> = [];

  const pending = tracks.filter((t) => Boolean(t.youtubeVideoId));
  let completed = tracks.length - pending.length;
  let valid = 0;
  let invalid = 0;
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < pending.length) {
      if (shouldCancel && shouldCancel()) break;
      const track = pending[nextIdx++];
      if (!track.youtubeVideoId) continue;

      const res = await checkVideoEmbeddable(track.youtubeVideoId);
      if (shouldCancel && shouldCancel()) break;

      completed++;
      if (res.embeddable) {
        valid++;
        validTracks.push(track);
      } else {
        invalid++;
        invalidTracks.push({ track, validation: res });
      }

      if (onProgress) {
        onProgress(
          {
            total: tracks.length,
            completed,
            valid,
            invalid,
            currentTrackTitle: track.title,
          },
          res,
          track
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => worker());
  await Promise.all(workers);

  return { validTracks, invalidTracks };
}

/** True when we have a cached result proving this video cannot be embedded. */
export function isVideoEmbedBlocked(videoId: string | null | undefined): boolean {
  if (!videoId) return false;
  const cached = getCachedEmbedStatus(videoId);
  return Boolean(cached && !cached.embeddable);
}

/** A track needs attention when it has no video, failed matching, or a known embed block. */
export function isTrackUnplayable(track: Track): boolean {
  if (track.matchStatus === "failed" || !track.youtubeVideoId) return true;
  return isVideoEmbedBlocked(track.youtubeVideoId);
}

export function getUnplayableTracks(tracks: Track[]): Track[] {
  return tracks.filter(isTrackUnplayable);
}

/** Batch-check search hits for embed status (for UI badges). */
export async function checkHitsEmbeddability(
  hits: YoutubeSearchHit[],
  concurrency = 4
): Promise<Map<string, EmbedValidationResult>> {
  const results = new Map<string, EmbedValidationResult>();
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < hits.length) {
      const hit = hits[nextIdx++];
      const res = await checkVideoEmbeddable(hit.videoId);
      results.set(hit.videoId, res);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, hits.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
