import { Deck } from "../../types/deck";
import { parseYoutubeVideoId } from "../youtube/parseUrl";

export const SHARE_ID_LENGTH = 10;

export interface CanonicalSong {
  title: string;
  artist: string;
  album?: string;
  youtube?: string;
  start: number;
  end: number;
}

export interface CanonicalSharePayload {
  format: "bingo-musical-deck";
  schemaVersion: 1;
  name: string;
  songs: CanonicalSong[];
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readYoutubeId(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return parseYoutubeVideoId(trimmed) ?? undefined;
}

function canonicalSongFromRecord(raw: unknown): CanonicalSong | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const song = raw as Record<string, unknown>;
  if (typeof song.title !== "string" || !song.title.trim()) {
    return null;
  }
  if (typeof song.artist !== "string" || !song.artist.trim()) {
    return null;
  }

  const start = readNumber(song.start, readNumber(song.startTime, 30));
  const endCandidate = readNumber(song.end, readNumber(song.endTime, start + 15));
  const end = Math.max(start + 1, endCandidate);

  const youtube =
    readYoutubeId(song.youtube) ??
    readYoutubeId(song.youtubeVideoId) ??
    readYoutubeId(song.url);

  const canonical: CanonicalSong = {
    title: song.title.trim(),
    artist: song.artist.trim(),
    start,
    end,
  };

  if (typeof song.album === "string" && song.album.trim()) {
    canonical.album = song.album.trim();
  }
  if (youtube) {
    canonical.youtube = youtube;
  }

  return canonical;
}

function canonicalSongFromTrack(raw: unknown): CanonicalSong | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const track = raw as Record<string, unknown>;
  if (typeof track.title !== "string" || !track.title.trim()) {
    return null;
  }
  if (typeof track.artist !== "string" || !track.artist.trim()) {
    return null;
  }

  const start = readNumber(track.startTime, 30);
  const end = Math.max(start + 1, readNumber(track.endTime, start + 15));
  const youtube = readYoutubeId(track.youtubeVideoId);

  const canonical: CanonicalSong = {
    title: track.title.trim(),
    artist: track.artist.trim(),
    start,
    end,
  };

  if (typeof track.album === "string" && track.album.trim()) {
    canonical.album = track.album.trim();
  }
  if (youtube) {
    canonical.youtube = youtube;
  }

  return canonical;
}

export function buildCanonicalSharePayload(deck: Deck): CanonicalSharePayload {
  const songs: CanonicalSong[] = [];

  for (const track of deck.tracks) {
    const song: CanonicalSong = {
      title: track.title.trim(),
      artist: track.artist.trim(),
      start: track.startTime,
      end: track.endTime,
    };
    if (track.album?.trim()) {
      song.album = track.album.trim();
    }
    if (track.youtubeVideoId) {
      song.youtube = track.youtubeVideoId;
    }
    songs.push(song);
  }

  return {
    format: "bingo-musical-deck",
    schemaVersion: 1,
    name: deck.name.trim(),
    songs,
  };
}

export function canonicalizeSharePayload(data: unknown): CanonicalSharePayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;
  if (obj.format !== "bingo-musical-deck") {
    return null;
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return null;
  }

  const songList = Array.isArray(obj.songs) ? obj.songs : null;
  const trackList = Array.isArray(obj.tracks) ? obj.tracks : null;
  const useSongs = Boolean(songList && (obj.format === "bingo-musical-deck" || !trackList));
  const source = useSongs ? songList : trackList;

  if (!source || source.length === 0) {
    return null;
  }

  const songs: CanonicalSong[] = [];
  for (const entry of source) {
    const canonical = useSongs ? canonicalSongFromRecord(entry) : canonicalSongFromTrack(entry);
    if (!canonical) {
      return null;
    }
    songs.push(canonical);
  }

  return {
    format: "bingo-musical-deck",
    schemaVersion: 1,
    name: obj.name.trim(),
    songs,
  };
}

export function serializeCanonicalPayload(payload: CanonicalSharePayload): string {
  const songs = payload.songs.map((song) => {
    const entry: Record<string, unknown> = {
      title: song.title,
      artist: song.artist,
      start: song.start,
      end: song.end,
    };
    if (song.album) {
      entry.album = song.album;
    }
    if (song.youtube) {
      entry.youtube = song.youtube;
    }
    return entry;
  });

  return JSON.stringify({
    format: payload.format,
    schemaVersion: payload.schemaVersion,
    name: payload.name,
    songs,
  });
}

export function canonicalPayloadsEqual(a: CanonicalSharePayload, b: CanonicalSharePayload): boolean {
  return serializeCanonicalPayload(a) === serializeCanonicalPayload(b);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function computeShareId(canonical: CanonicalSharePayload): Promise<string> {
  const json = serializeCanonicalPayload(canonical);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return toBase64Url(new Uint8Array(hash)).slice(0, SHARE_ID_LENGTH);
}
