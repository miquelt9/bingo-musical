import { Track } from "../../types/deck";
import { createTrack } from "../tracks";
import { INVIDIOUS_INSTANCES, PIPED_INSTANCES, fetchWithTimeout } from "./instances";
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

export function hitToTrack(hit: YoutubeSearchHit): Track {
  const { title, artist } = guessTitleArtist(hit.title, hit.author);
  return createTrack({
    title,
    artist,
    albumArtUrl: hit.thumbnailUrl || getYoutubeThumbnailUrl(hit.videoId),
    durationMs: (hit.lengthSeconds || 180) * 1000,
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
  if (item.type && item.type !== "video") return null;
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
  if (item.type && item.type !== "stream") return null;
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

async function searchInvidious(instance: string, query: string, limit: number): Promise<YoutubeSearchHit[] | null> {
  try {
    const res = await fetchWithTimeout(
      `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`,
      4500
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

async function searchPiped(instance: string, query: string, limit: number): Promise<YoutubeSearchHit[] | null> {
  try {
    const res = await fetchWithTimeout(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, 4500);
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

export async function searchYoutubeVideos(query: string, limit = 8): Promise<YoutubeSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  for (const instance of INVIDIOUS_INSTANCES) {
    const hits = await searchInvidious(instance, q, limit);
    if (hits) return hits;
  }
  for (const instance of PIPED_INSTANCES) {
    const hits = await searchPiped(instance, q, limit);
    if (hits) return hits;
  }
  return [];
}

async function fetchVideoHit(videoId: string): Promise<YoutubeSearchHit> {
  const fallback: YoutubeSearchHit = {
    videoId,
    title: "YouTube video",
    author: "Unknown Artist",
    thumbnailUrl: getYoutubeThumbnailUrl(videoId),
    lengthSeconds: 180,
  };

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${instance}/api/v1/videos/${videoId}`, 4500);
      if (!res.ok) continue;
      const data = await res.json();
      const hit = mapInvidiousVideo({ ...data, videoId, type: "video" });
      if (hit) return hit;
    } catch {
      // try next
    }
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${instance}/streams/${videoId}`, 4500);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        videoId,
        title: data.title || fallback.title,
        author: data.uploader || data.uploaderName || fallback.author,
        thumbnailUrl: data.thumbnailUrl || data.thumbnail || fallback.thumbnailUrl,
        lengthSeconds: typeof data.duration === "number" ? data.duration : fallback.lengthSeconds,
      };
    } catch {
      // try next
    }
  }

  return fallback;
}

async function fetchPlaylistHits(playlistId: string): Promise<{ name: string; hits: YoutubeSearchHit[] }> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      const videos = Array.isArray(data.videos) ? data.videos : [];
      const hits = videos
        .map((video: { videoId?: string; title?: string; author?: string; lengthSeconds?: number; videoThumbnails?: Array<{ quality?: string; url?: string }> }) =>
          mapInvidiousVideo({ ...video, type: "video" })
        )
        .filter((h: YoutubeSearchHit | null): h is YoutubeSearchHit => Boolean(h));
      if (hits.length > 0) {
        return { name: data.title || "YouTube playlist", hits: hits.slice(0, 50) };
      }
    } catch {
      // try next
    }
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${instance}/playlists/${encodeURIComponent(playlistId)}`, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      const videos = Array.isArray(data.relatedStreams) ? data.relatedStreams : [];
      const hits = videos
        .map((video: { url?: string; title?: string; uploaderName?: string; duration?: number; thumbnail?: string }) =>
          mapPipedVideo({ ...video, type: "stream" })
        )
        .filter((h: YoutubeSearchHit | null): h is YoutubeSearchHit => Boolean(h));
      if (hits.length > 0) {
        return { name: data.name || "YouTube playlist", hits: hits.slice(0, 50) };
      }
    } catch {
      // try next
    }
  }

  throw new Error("Could not load that YouTube playlist. Try a song name search instead.");
}

export type ResolveKind = "video" | "playlist" | "search";

export interface ResolveYoutubeQueryResult {
  kind: ResolveKind;
  query: string;
  hits: YoutubeSearchHit[];
  playlistName?: string;
}

export async function resolveYoutubeQuery(raw: string): Promise<ResolveYoutubeQueryResult> {
  const query = raw.trim();
  if (!query) {
    return { kind: "search", query, hits: [] };
  }

  const videoId = parseYoutubeVideoId(query);
  const playlistId = parseYoutubePlaylistId(query);
  const looksLikeWatchUrl = Boolean(videoId) && /youtube\.com|youtu\.be/i.test(query);

  if (videoId && (looksLikeWatchUrl || !playlistId || query.includes("v="))) {
    const hit = await fetchVideoHit(videoId);
    return { kind: "video", query, hits: [hit] };
  }

  if (playlistId) {
    const playlist = await fetchPlaylistHits(playlistId);
    return { kind: "playlist", query, hits: playlist.hits, playlistName: playlist.name };
  }

  const hits = await searchYoutubeVideos(query, 8);
  return { kind: "search", query, hits };
}
