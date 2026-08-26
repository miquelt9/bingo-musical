import { Track } from "../types/deck";

export function defaultClipWindow(durationMs = 180000): { startTime: number; endTime: number } {
  const durationSec = Math.max(1, Math.floor(durationMs / 1000));
  const startTime = durationSec > 40 ? 30 : 0;
  const endTime = Math.min(startTime + 15, durationSec);
  return { startTime, endTime };
}

export function createTrack(input: {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  durationMs?: number;
  youtubeVideoId?: string | null;
  youtubeTitle?: string;
  matchStatus?: Track["matchStatus"];
}): Track {
  const durationMs = input.durationMs ?? 180000;
  const { startTime, endTime } = defaultClipWindow(durationMs);
  const youtubeVideoId = input.youtubeVideoId ?? null;

  return {
    id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    title: input.title.trim(),
    artist: input.artist.trim() || "Unknown Artist",
    album: input.album?.trim() || "",
    albumArtUrl: input.albumArtUrl?.trim() || "",
    durationMs,
    youtubeVideoId,
    youtubeTitle: input.youtubeTitle,
    startTime,
    endTime,
    matchStatus: input.matchStatus ?? (youtubeVideoId ? "matched" : "pending"),
  };
}

export interface ParsedSongList {
  tracks: Track[];
  skipped: number;
}

/**
 * Parses a host-pasted song list. One song per line.
 * Accepted formats:
 *   Artist - Title
 *   Title by Artist
 *   Title, Artist
 *   Title<TAB>Artist
 */
export function parseSongList(raw: string): ParsedSongList {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const tracks: Track[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseSongLine(line);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const key = `${parsed.artist.toLowerCase()}::${parsed.title.toLowerCase()}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    tracks.push(createTrack(parsed));
  }

  return { tracks, skipped };
}

function parseSongLine(line: string): { title: string; artist: string } | null {
  const cleaned = line.replace(/^[\d]+[.)]\s+/, "").trim();
  if (!cleaned) return null;

  const tabParts = cleaned.split(/\t+/);
  if (tabParts.length >= 2) {
    return splitTitleArtist(tabParts[0], tabParts[1]);
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
  }

  const dashParts = cleaned.split(/\s[-–—]\s/);
  if (dashParts.length >= 2) {
    return { artist: dashParts[0].trim(), title: dashParts.slice(1).join(" - ").trim() };
  }

  const commaParts = cleaned.split(",");
  if (commaParts.length >= 2) {
    return { title: commaParts[0].trim(), artist: commaParts.slice(1).join(",").trim() };
  }

  return { title: cleaned, artist: "Unknown Artist" };
}

function splitTitleArtist(a: string, b: string): { title: string; artist: string } {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return { title: left || right, artist: right ? "Unknown Artist" : left };
  return { artist: left, title: right };
}
