import { Deck, MusicProvider, Track } from "../../types/deck";
import { parseYoutubeVideoId } from "../youtube/parseUrl";

export const SHARE_ID_LENGTH = 10;

export interface CanonicalMedia {
  provider: MusicProvider;
  id: string;
}

export interface CanonicalSong {
  title: string;
  artist: string;
  album?: string;
  start: number;
  end: number;
  media?: CanonicalMedia;
  /** Legacy v1 representation. */
  youtube?: string;
}

export interface CanonicalSharePayload {
  format: "bingo-musical-deck";
  schemaVersion: 1 | 2;
  provider: MusicProvider;
  name: string;
  songs: CanonicalSong[];
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readYoutubeId(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return parseYoutubeVideoId(trimmed) ?? undefined;
}

function readProvider(value: unknown): MusicProvider | null {
  return value === "youtube" || value === "deezer" ? value : null;
}

function canonicalSongFromRecord(raw: unknown, provider: MusicProvider, legacy: boolean): CanonicalSong | null {
  if (!raw || typeof raw !== "object") return null;
  const song = raw as Record<string, unknown>;
  if (typeof song.title !== "string" || !song.title.trim()) return null;
  if (typeof song.artist !== "string" || !song.artist.trim()) return null;

  const start = readNumber(song.start, readNumber(song.startTime, provider === "deezer" ? 0 : 30));
  const endCandidate = readNumber(song.end, readNumber(song.endTime, start + (provider === "deezer" ? 30 : 15)));
  const canonical: CanonicalSong = {
    title: song.title.trim(),
    artist: song.artist.trim(),
    start: Math.max(0, start),
    end: Math.max(start + 1, endCandidate),
  };

  if (typeof song.album === "string" && song.album.trim()) canonical.album = song.album.trim();

  if (legacy) {
    const youtube = readYoutubeId(song.youtube) ?? readYoutubeId(song.youtubeVideoId) ?? readYoutubeId(song.url);
    if (youtube) canonical.youtube = youtube;
    return canonical;
  }

  const media = song.media && typeof song.media === "object" ? song.media as Record<string, unknown> : null;
  const mediaProvider = readProvider(media?.provider) ?? provider;
  const mediaId = typeof media?.id === "string" ? media.id.trim() : "";
  if (mediaId && mediaProvider === provider) canonical.media = { provider, id: mediaId };
  return canonical;
}

export function buildCanonicalSharePayload(deck: Deck): CanonicalSharePayload {
  return {
    format: "bingo-musical-deck",
    schemaVersion: 2,
    provider: deck.provider,
    name: deck.name.trim(),
    songs: deck.tracks.map((track) => {
      const song: CanonicalSong = {
        title: track.title.trim(),
        artist: track.artist.trim(),
        start: track.startTime,
        end: track.endTime,
      };
      if (track.album?.trim()) song.album = track.album.trim();
      const legacyYoutubeId = (track as Track & { youtubeVideoId?: string | null }).youtubeVideoId;
      if (track.media) song.media = { provider: track.media.provider, id: track.media.id };
      else if (legacyYoutubeId) song.media = { provider: "youtube", id: legacyYoutubeId };
      return song;
    }),
  };
}

export function canonicalizeSharePayload(data: unknown): CanonicalSharePayload | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.format !== "bingo-musical-deck" || typeof obj.name !== "string" || !obj.name.trim()) return null;

  const songList = Array.isArray(obj.songs) ? obj.songs : null;
  const trackList = Array.isArray(obj.tracks) ? obj.tracks : null;
  if ((!songList || songList.length === 0) && (!trackList || trackList.length === 0)) return null;

  const isLegacy = obj.schemaVersion !== 2;
  const provider = isLegacy ? "youtube" : readProvider(obj.provider);
  if (!provider) return null;

  const source = songList ?? trackList;
  if (!source) return null;
  const songs: CanonicalSong[] = [];
  for (const entry of source) {
    const canonical = canonicalSongFromRecord(entry, provider, isLegacy);
    if (!canonical) return null;
    songs.push(canonical);
  }

  return {
    format: "bingo-musical-deck",
    schemaVersion: isLegacy ? 1 : 2,
    provider,
    name: obj.name.trim(),
    songs,
  };
}

export function serializeCanonicalPayload(payload: CanonicalSharePayload): string {
  if (payload.schemaVersion === 1) {
    return JSON.stringify({
      format: payload.format,
      schemaVersion: 1,
      name: payload.name,
      songs: payload.songs.map((song) => {
        const entry: Record<string, unknown> = {
          title: song.title,
          artist: song.artist,
          start: song.start,
          end: song.end,
        };
        if (song.album) entry.album = song.album;
        if (song.youtube) entry.youtube = song.youtube;
        return entry;
      }),
    });
  }

  return JSON.stringify({
    format: payload.format,
    schemaVersion: 2,
    provider: payload.provider,
    name: payload.name,
    songs: payload.songs.map((song) => {
      const entry: Record<string, unknown> = {
        title: song.title,
        artist: song.artist,
        start: song.start,
        end: song.end,
      };
      if (song.album) entry.album = song.album;
      if (song.media) entry.media = song.media;
      return entry;
    }),
  });
}

export function canonicalPayloadsEqual(a: CanonicalSharePayload, b: CanonicalSharePayload): boolean {
  return serializeCanonicalPayload(a) === serializeCanonicalPayload(b);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function computeShareId(canonical: CanonicalSharePayload): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializeCanonicalPayload(canonical))
  );
  return toBase64Url(new Uint8Array(hash)).slice(0, SHARE_ID_LENGTH);
}
