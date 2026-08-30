import { Track } from "../../types/deck";
import { createTrack } from "../tracks";
import {
  fetchWithTimeout,
  getLastYoutubeBackend,
  getYoutubeBackends,
  raceFirstSuccess,
  rememberYoutubeBackend,
} from "./instances";
import { getYoutubeThumbnailUrl, parseYoutubePlaylistId, parseYoutubeVideoId } from "./parseUrl";

export interface YoutubeSearchHit {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  lengthSeconds: number;
}

export function guessTitleArtist(videoTitle: string, author: string): { title: string; artist: string } {
  const cleaned = videoTitle
    .replace(/\s*[\(\[](?:official\s+(?:audio|video|music\s+video)|lyrics?|visualizer)[\)\]]/gi, "")
    .replace(/\s*[-–—]\s*(official\s+)?(audio|video|music video|lyrics?|visualizer).*$/gi, "")
    .trim();

  const parts = cleaned.split(/\s[-–—]\s/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }

  return {
    title: cleaned || videoTitle,
    artist: author || "Unknown Artist",
  };
}

export function hitToTrack(
  hit: YoutubeSearchHit,
  catalog?: { title: string; artist: string; album?: string; artworkUrl?: string; durationMs?: number }
): Track {
  const guessed = guessTitleArtist(hit.title, hit.author);
  return createTrack({
    title: catalog?.title || guessed.title,
    artist: catalog?.artist || guessed.artist,
    album: catalog?.album || "",
    albumArtUrl: catalog?.artworkUrl || hit.thumbnailUrl || getYoutubeThumbnailUrl(hit.videoId),
    durationMs: catalog?.durationMs || (hit.lengthSeconds || 180) * 1000,
    youtubeVideoId: hit.videoId,
    youtubeTitle: hit.title,
    matchStatus: "matched",
  });
}

export function formatDuration(lengthSeconds: number): string {
  if (!lengthSeconds || lengthSeconds < 0) return "";
  const minutes = Math.floor(lengthSeconds / 60);
  const seconds = Math.floor(lengthSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

export function rankYoutubeHits(hits: YoutubeSearchHit[], query: string): YoutubeSearchHit[] {
  const tokens = query
    .toLowerCase()
    .replace(/\bofficial\s+audio\b/g, "")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  const score = (hit: YoutubeSearchHit): number => {
    const hay = `${hit.title} ${hit.author}`.toLowerCase();
    let points = 0;
    for (const token of tokens) {
      if (hay.includes(token)) points += 2;
    }
    if (/official/.test(hit.title)) points += 2;
    if (/\baudio\b/i.test(hit.title) && !/\blive\b/i.test(hit.title)) points += 1;
    if (/karaoke|nightcore|8d audio|cover|slowed|sped up|lyrics video/i.test(hay)) points -= 4;
    if (hit.lengthSeconds > 0 && hit.lengthSeconds < 45) points -= 2;
    if (hit.lengthSeconds > 15 * 60) points -= 1;
    return points;
  };

  return [...hits].sort((a, b) => score(b) - score(a));
}

function invidiousThumb(item: { videoThumbnails?: Array<{ quality?: string; url?: string }>; videoId?: string }): string {
  const thumbs = item.videoThumbnails || [];
  return (
    thumbs.find((t) => t.quality === "medium")?.url ||
    thumbs.find((t) => t.quality === "high")?.url ||
    thumbs[0]?.url ||
    (item.videoId ? getYoutubeThumbnailUrl(item.videoId) : "")
  );
}

function mapInvidiousVideo(item: {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ quality?: string; url?: string }>;
}): YoutubeSearchHit | null {
  if (item.type && item.type !== "video" && item.type !== "shortVideo") return null;
  const videoId = item.videoId || "";
  if (!isVideoId(videoId)) return null;
  return {
    videoId,
    title: item.title || "Untitled",
    author: item.author || "Unknown Artist",
    thumbnailUrl: invidiousThumb(item),
    lengthSeconds: typeof item.lengthSeconds === "number" ? item.lengthSeconds : 0,
  };
}

function mapPipedVideo(item: {
  type?: string;
  url?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
}): YoutubeSearchHit | null {
  if (item.type && item.type !== "stream" && item.type !== "video") return null;
  const videoId = parseYoutubeVideoId(item.url || "") || "";
  if (!isVideoId(videoId)) return null;
  return {
    videoId,
    title: item.title || "Untitled",
    author: item.uploaderName || "Unknown Artist",
    thumbnailUrl: item.thumbnail || getYoutubeThumbnailUrl(videoId),
    lengthSeconds: typeof item.duration === "number" ? item.duration : 0,
  };
}

async function searchInvidious(
  instance: string,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<YoutubeSearchHit[] | null> {
  try {
    const res = await fetchWithTimeout(
      `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`,
      4000,
      signal
    );
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items)) return null;
    const hits = items.map(mapInvidiousVideo).filter((h): h is YoutubeSearchHit => Boolean(h));
    return hits.length > 0 ? hits.slice(0, limit) : null;
  } catch {
    return null;
  }
}

async function searchPiped(
  instance: string,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<YoutubeSearchHit[] | null> {
  try {
    const res = await fetchWithTimeout(
      `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
      4000,
      signal
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.items || data;
    if (!Array.isArray(items)) return null;
    const hits = items.map(mapPipedVideo).filter((h): h is YoutubeSearchHit => Boolean(h));
    return hits.length > 0 ? hits.slice(0, limit) : null;
  } catch {
    return null;
  }
}

export async function searchYoutubeVideos(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<YoutubeSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const last = getLastYoutubeBackend();
  if (last) {
    const hits =
      last.kind === "piped"
        ? await searchPiped(last.url, q, limit, signal)
        : await searchInvidious(last.url, q, limit, signal);
    if (hits) return rankYoutubeHits(hits, q).slice(0, limit);
  }

  const backends = getYoutubeBackends();
  const skip = last?.url;
  const tasks: Array<(taskSignal: AbortSignal) => Promise<YoutubeSearchHit[] | null>> = [
    ...backends.piped
      .filter((instance) => instance !== skip)
      .map((instance) => async (taskSignal: AbortSignal) => {
        const hits = await searchPiped(instance, q, limit, taskSignal);
        if (hits) rememberYoutubeBackend("piped", instance);
        return hits;
      }),
    ...backends.invidious
      .filter((instance) => instance !== skip)
      .map((instance) => async (taskSignal: AbortSignal) => {
        const hits = await searchInvidious(instance, q, limit, taskSignal);
        if (hits) rememberYoutubeBackend("invidious", instance);
        return hits;
      }),
  ];

  const hits = await raceFirstSuccess(tasks, { parentSignal: signal, concurrency: 4 });
  return hits ? rankYoutubeHits(hits, q).slice(0, limit) : [];
}

async function fetchVideoHit(videoId: string, signal?: AbortSignal): Promise<YoutubeSearchHit> {
  const fallback: YoutubeSearchHit = {
    videoId,
    title: "YouTube video",
    author: "Unknown Artist",
    thumbnailUrl: getYoutubeThumbnailUrl(videoId),
    lengthSeconds: 180,
  };

  const backends = getYoutubeBackends();
  const tasks: Array<(taskSignal: AbortSignal) => Promise<YoutubeSearchHit | null>> = [
    ...backends.invidious.map((instance) => async (taskSignal: AbortSignal) => {
      try {
        const res = await fetchWithTimeout(`${instance}/api/v1/videos/${videoId}`, 4000, taskSignal);
        if (!res.ok) return null;
        const data = await res.json();
        const hit = mapInvidiousVideo({ ...data, videoId, type: "video" });
        if (hit) rememberYoutubeBackend("invidious", instance);
        return hit;
      } catch {
        return null;
      }
    }),
    ...backends.piped.map((instance) => async (taskSignal: AbortSignal) => {
      try {
        const res = await fetchWithTimeout(`${instance}/streams/${videoId}`, 4000, taskSignal);
        if (!res.ok) return null;
        const data = await res.json();
        rememberYoutubeBackend("piped", instance);
        return {
          videoId,
          title: data.title || fallback.title,
          author: data.uploader || data.uploaderName || fallback.author,
          thumbnailUrl: data.thumbnailUrl || data.thumbnail || fallback.thumbnailUrl,
          lengthSeconds: typeof data.duration === "number" ? data.duration : fallback.lengthSeconds,
        };
      } catch {
        return null;
      }
    }),
  ];

  return (await raceFirstSuccess(tasks, { parentSignal: signal, concurrency: 8 })) || fallback;
}

async function fetchPlaylistHits(
  playlistId: string,
  signal?: AbortSignal
): Promise<{ name: string; hits: YoutubeSearchHit[] }> {
  const backends = getYoutubeBackends();
  const tasks: Array<(taskSignal: AbortSignal) => Promise<{ name: string; hits: YoutubeSearchHit[] } | null>> = [
    ...backends.invidious.map((instance) => async (taskSignal: AbortSignal) => {
      try {
        const res = await fetchWithTimeout(
          `${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`,
          6000,
          taskSignal
        );
        if (!res.ok) return null;
        const data = await res.json();
        const videos = Array.isArray(data.videos) ? data.videos : [];
        const hits = videos
          .map((video: { videoId?: string; title?: string; author?: string; lengthSeconds?: number; videoThumbnails?: Array<{ quality?: string; url?: string }> }) =>
            mapInvidiousVideo({ ...video, type: "video" })
          )
          .filter((h: YoutubeSearchHit | null): h is YoutubeSearchHit => Boolean(h));
        if (hits.length === 0) return null;
        rememberYoutubeBackend("invidious", instance);
        return { name: data.title || "YouTube playlist", hits: hits.slice(0, 50) };
      } catch {
        return null;
      }
    }),
    ...backends.piped.map((instance) => async (taskSignal: AbortSignal) => {
      try {
        const res = await fetchWithTimeout(
          `${instance}/playlists/${encodeURIComponent(playlistId)}`,
          6000,
          taskSignal
        );
        if (!res.ok) return null;
        const data = await res.json();
        const videos = Array.isArray(data.relatedStreams) ? data.relatedStreams : [];
        const hits = videos
          .map((video: { url?: string; title?: string; uploaderName?: string; duration?: number; thumbnail?: string }) =>
            mapPipedVideo({ ...video, type: "stream" })
          )
          .filter((h: YoutubeSearchHit | null): h is YoutubeSearchHit => Boolean(h));
        if (hits.length === 0) return null;
        rememberYoutubeBackend("piped", instance);
        return { name: data.name || "YouTube playlist", hits: hits.slice(0, 50) };
      } catch {
        return null;
      }
    }),
  ];

  const playlist = await raceFirstSuccess(tasks, { parentSignal: signal, concurrency: 6 });
  if (!playlist) {
    throw new Error("Could not load that YouTube playlist. Try a song name search instead.");
  }
  return playlist;
}

export type ResolveKind = "video" | "playlist" | "search";

export interface ResolveYoutubeQueryResult {
  kind: ResolveKind;
  query: string;
  hits: YoutubeSearchHit[];
  playlistName?: string;
}

export async function resolveYoutubeQuery(
  raw: string,
  signal?: AbortSignal
): Promise<ResolveYoutubeQueryResult> {
  const query = raw.trim();
  if (!query) {
    return { kind: "search", query, hits: [] };
  }

  const videoId = parseYoutubeVideoId(query);
  const playlistId = parseYoutubePlaylistId(query);
  const looksLikeWatchUrl = Boolean(videoId) && /youtube\.com|youtu\.be/i.test(query);

  if (videoId && (looksLikeWatchUrl || !playlistId || query.includes("v="))) {
    const hit = await fetchVideoHit(videoId, signal);
    return { kind: "video", query, hits: [hit] };
  }

  if (playlistId) {
    const playlist = await fetchPlaylistHits(playlistId, signal);
    return { kind: "playlist", query, hits: playlist.hits, playlistName: playlist.name };
  }

  const hits = await searchYoutubeVideos(query, 8, signal);
  return { kind: "search", query, hits };
}

export type EmbedStatusLookup = (videoId: string) => { embeddable: boolean } | null;

/** Hide blocked hits from search UI; keep at most one blocked hit as a warning. */
export function filterSearchHitsForDisplay(
  hits: YoutubeSearchHit[],
  getStatus: EmbedStatusLookup,
  isChecking = false
): { visible: YoutubeSearchHit[]; hiddenBlockedCount: number } {
  if (isChecking) {
    return { visible: hits, hiddenBlockedCount: 0 };
  }

  const visible: YoutubeSearchHit[] = [];
  let firstBlocked: YoutubeSearchHit | null = null;
  let hiddenBlockedCount = 0;

  for (const hit of hits) {
    const status = getStatus(hit.videoId);
    if (!status || status.embeddable) {
      visible.push(hit);
    } else if (!firstBlocked) {
      firstBlocked = hit;
    } else {
      hiddenBlockedCount += 1;
    }
  }

  if (firstBlocked) {
    visible.push(firstBlocked);
  }

  return { visible, hiddenBlockedCount };
}
