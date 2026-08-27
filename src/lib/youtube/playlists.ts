import { Deck, Track } from "../../types/deck";
import { createTrack } from "../tracks";
import {
  fetchWithTimeout,
  getYoutubeBackends,
  raceFirstSuccess,
  rememberYoutubeBackend,
} from "./instances";
import { parseYoutubePlaylistId, parseYoutubeVideoId } from "./parseUrl";

export interface YoutubePlaylistImport {
  playlistId: string;
  name: string;
  tracks: Track[];
}

export { parseYoutubePlaylistId };

function guessTitleArtist(videoTitle: string, author: string): { title: string; artist: string } {
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

async function tryInvidiousPlaylist(
  instance: string,
  playlistId: string,
  signal?: AbortSignal
): Promise<YoutubePlaylistImport | null> {
  try {
    const res = await fetchWithTimeout(
      `${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`,
      6000,
      signal
    );
    if (!res.ok) return null;
    const data = await res.json();
    const videos = Array.isArray(data.videos) ? data.videos : [];
    if (videos.length === 0) return null;

    const tracks: Track[] = [];
    const seen = new Set<string>();

    for (const video of videos) {
      const videoId = typeof video.videoId === "string" ? video.videoId : "";
      if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
      seen.add(videoId);

      const { title, artist } = guessTitleArtist(video.title || "Untitled", video.author || "");
      const durationMs = typeof video.lengthSeconds === "number" ? video.lengthSeconds * 1000 : 180000;
      const thumb = Array.isArray(video.videoThumbnails)
        ? video.videoThumbnails.find((t: { quality?: string }) => t.quality === "medium")?.url ||
          video.videoThumbnails[0]?.url
        : "";

      tracks.push(
        createTrack({
          title,
          artist,
          albumArtUrl: thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs,
          youtubeVideoId: videoId,
          youtubeTitle: video.title,
          matchStatus: "matched",
        })
      );
    }

    if (tracks.length === 0) return null;
    rememberYoutubeBackend("invidious", instance);
    return {
      playlistId,
      name: data.title || "YouTube Playlist",
      tracks,
    };
  } catch {
    return null;
  }
}

async function tryPipedPlaylist(
  instance: string,
  playlistId: string,
  signal?: AbortSignal
): Promise<YoutubePlaylistImport | null> {
  try {
    const res = await fetchWithTimeout(
      `${instance}/playlists/${encodeURIComponent(playlistId)}`,
      6000,
      signal
    );
    if (!res.ok) return null;
    const data = await res.json();
    const videos = Array.isArray(data.relatedStreams) ? data.relatedStreams : [];
    if (videos.length === 0) return null;

    const tracks: Track[] = [];
    const seen = new Set<string>();

    for (const video of videos) {
      const videoId = parseYoutubeVideoId(video.url || "") || "";
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);

      const { title, artist } = guessTitleArtist(video.title || "Untitled", video.uploaderName || "");
      const durationMs = typeof video.duration === "number" ? video.duration * 1000 : 180000;

      tracks.push(
        createTrack({
          title,
          artist,
          albumArtUrl: video.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs,
          youtubeVideoId: videoId,
          youtubeTitle: video.title,
          matchStatus: "matched",
        })
      );
    }

    if (tracks.length === 0) return null;
    rememberYoutubeBackend("piped", instance);
    return {
      playlistId,
      name: data.name || "YouTube Playlist",
      tracks,
    };
  } catch {
    return null;
  }
}

export async function fetchYoutubePlaylist(input: string): Promise<YoutubePlaylistImport> {
  const playlistId = parseYoutubePlaylistId(input);
  if (!playlistId) {
    throw new Error("Paste a YouTube playlist URL (youtube.com/playlist?list=...).");
  }

  const backends = getYoutubeBackends();
  const result = await raceFirstSuccess(
    [
      ...backends.piped.map(
        (instance) => (signal: AbortSignal) => tryPipedPlaylist(instance, playlistId, signal)
      ),
      ...backends.invidious.map(
        (instance) => (signal: AbortSignal) => tryInvidiousPlaylist(instance, playlistId, signal)
      ),
    ],
    { concurrency: 6 }
  );

  if (result) return result;

  throw new Error(
    "Could not load that YouTube playlist from public search instances. Paste a song list instead, or try again later."
  );
}

export function createDeckFromYoutubePlaylist(imported: YoutubePlaylistImport): Deck {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: imported.name,
    createdAt: now,
    updatedAt: now,
    source: {
      type: "youtube-playlist",
      playlistId: imported.playlistId,
      url: `https://www.youtube.com/playlist?list=${imported.playlistId}`,
      name: imported.name,
    },
    tracks: imported.tracks,
  };
}
