import { Track } from "../../types/deck";

const INVIDIOUS_INSTANCES = [
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://invidious.private.coffee",
  "https://vid.priv.au",
  "https://invidious.fdn.fr",
  "https://invidious.protokolla.fi",
  "https://invidious.perennialte.ch",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.privacydev.net",
  "https://piped-api.lunar.icu",
  "https://api.piped.yt",
];

export interface MatchResult {
  videoId: string | null;
  videoTitle?: string;
  sourceInstance?: string;
  error?: string;
}

export function cleanSearchQuery(track: Pick<Track, "title" | "artist">): string {
  // Remove (feat. ...), (with ...), [Remastered], (Remastered 2011), etc.
  const cleanTitle = track.title
    .replace(/\s*[\(\[](?:feat|ft|with|prod)[\.\s][^\)\]]+[\)\]]/gi, "")
    .replace(/\s*[\(\[](?:remastered|remaster|radio edit|original mix|bonus track|deluxe|version)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*remaster(?:ed)?(?:\s*\d+)?/gi, "")
    .trim();

  const firstArtist = track.artist.split(/[,/&]/)[0].trim();
  return `${firstArtist} ${cleanTitle} official audio`;
}

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function tryInvidiousSearch(instance: string, query: string): Promise<MatchResult | null> {
  try {
    const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`;
    const res = await fetchWithTimeout(url, 4500);
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    // Pick first item that has a valid 11-char videoId
    for (const item of items) {
      const vid = item.videoId || item.id;
      if (vid && typeof vid === "string" && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        return {
          videoId: vid,
          videoTitle: item.title,
          sourceInstance: instance,
        };
      }
    }
  } catch {
    // Timeout or CORS/network failure, fail gracefully
  }
  return null;
}

async function tryPipedSearch(instance: string, query: string): Promise<MatchResult | null> {
  try {
    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
    const res = await fetchWithTimeout(url, 4500);
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.items || data;
    if (!Array.isArray(items) || items.length === 0) return null;

    for (const item of items) {
      // Piped url format is usually /watch?v=xxxx or url field
      let vid: string | null = null;
      if (item.url && typeof item.url === "string") {
        const match = item.url.match(/v=([a-zA-Z0-9_-]{11})/);
        if (match) vid = match[1];
        else if (item.url.startsWith("/watch?v=")) {
          vid = item.url.replace("/watch?v=", "").substring(0, 11);
        }
      }
      if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        return {
          videoId: vid,
          videoTitle: item.title,
          sourceInstance: instance,
        };
      }
    }
  } catch {
    // Timeout or CORS/network failure
  }
  return null;
}

export async function matchTrackWithYoutube(track: Pick<Track, "title" | "artist">): Promise<MatchResult> {
  const query = cleanSearchQuery(track);

  // 1. Try Invidious instances
  for (const instance of INVIDIOUS_INSTANCES) {
    const result = await tryInvidiousSearch(instance, query);
    if (result && result.videoId) {
      return result;
    }
  }

  // 2. Try Piped instances fallback
  for (const instance of PIPED_INSTANCES) {
    const result = await tryPipedSearch(instance, query);
    if (result && result.videoId) {
      return result;
    }
  }

  return {
    videoId: null,
    error: "No public Invidious or Piped instance returned search results. You can manually enter the YouTube URL.",
  };
}

export interface BatchMatchProgress {
  total: number;
  completed: number;
  matched: number;
  failed: number;
  currentTrackTitle?: string;
}

export async function batchMatchTracks(
  tracks: Track[],
  concurrency = 2,
  onProgress?: (progress: BatchMatchProgress, updatedTrack: Track) => void,
  shouldCancel?: () => boolean
): Promise<Track[]> {
  const results = [...tracks];
  const pendingIndices = results
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => !t.youtubeVideoId || t.matchStatus === "pending" || t.matchStatus === "failed");

  let completed = tracks.length - pendingIndices.length;
  let matched = tracks.filter((t) => t.matchStatus === "matched" || t.matchStatus === "manual").length;
  let failed = tracks.filter((t) => t.matchStatus === "failed").length;

  let nextIdx = 0;

  async function worker() {
    while (nextIdx < pendingIndices.length) {
      if (shouldCancel && shouldCancel()) break;

      const current = pendingIndices[nextIdx++];
      const track = results[current.idx];

      const match = await matchTrackWithYoutube(track);

      if (shouldCancel && shouldCancel()) break;

      if (match.videoId) {
        results[current.idx] = {
          ...track,
          youtubeVideoId: match.videoId,
          youtubeTitle: match.videoTitle,
          matchStatus: "matched",
        };
        matched++;
      } else {
        results[current.idx] = {
          ...track,
          matchStatus: "failed",
        };
        failed++;
      }

      completed++;

      if (onProgress) {
        onProgress(
          {
            total: tracks.length,
            completed,
            matched,
            failed,
            currentTrackTitle: track.title,
          },
          results[current.idx]
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pendingIndices.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
