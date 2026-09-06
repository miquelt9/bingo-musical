import { Deck, DeckSource, MatchStatus, MusicProvider, Track, TrackMedia } from "../../types/deck";
import { SAMPLE_DEEZER_DECK, SAMPLE_POP_HITS_DECK } from "./mockDeck";
import { buildCanonicalSharePayload } from "../share/deckCanonical";
import { parseYoutubeVideoId } from "../youtube/parseUrl";
import { createTrack, defaultDeezerClipWindow, defaultClipWindow } from "../tracks";
import { downloadTextFile, slugifyFilename } from "./download";

const DECKS_STORAGE_KEY = "bingo-musical:decks";
const DEFAULT_DEEZER_SAMPLE_SEEDED_KEY = "bingo-musical:default-deezer-sample-seeded";

export class StorageQuotaError extends Error {
  constructor(message = "Browser storage is full. Try exporting or deleting old decks.") {
    super(message);
    this.name = "StorageQuotaError";
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new StorageQuotaError();
    }
    throw err;
  }
}

function providerFrom(value: unknown): MusicProvider {
  return value === "deezer" ? "deezer" : "youtube";
}

function readMedia(raw: unknown, provider: MusicProvider, legacy: Record<string, unknown>): TrackMedia | null {
  if (raw && typeof raw === "object") {
    const media = raw as Record<string, unknown>;
    const mediaProvider = media.provider === undefined ? provider : providerFrom(media.provider);
    const id = typeof media.id === "string" ? media.id.trim() : "";
    if (id && mediaProvider === "youtube") {
      const youtubeMedia: Extract<TrackMedia, { provider: "youtube" }> = { provider: "youtube", id };
      if (typeof media.providerTitle === "string") youtubeMedia.providerTitle = media.providerTitle;
      return youtubeMedia;
    }
    if (id && mediaProvider === "deezer") {
      return {
        provider: "deezer",
        id,
        previewUrl: typeof media.previewUrl === "string" && media.previewUrl.trim() ? media.previewUrl.trim() : null,
        previewDurationMs: typeof media.previewDurationMs === "number"
          ? Math.max(1000, Math.min(30000, media.previewDurationMs))
          : 30000,
        providerUrl: typeof media.providerUrl === "string" ? media.providerUrl : undefined,
      };
    }
  }

  const legacyYoutube = [legacy.youtubeVideoId, legacy.youtube, legacy.url]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const youtubeId = legacyYoutube ? parseYoutubeVideoId(legacyYoutube) : null;
  if (!youtubeId) return null;
  const youtubeMedia: Extract<TrackMedia, { provider: "youtube" }> = { provider: "youtube", id: youtubeId };
  if (typeof legacy.youtubeTitle === "string") youtubeMedia.providerTitle = legacy.youtubeTitle;
  return youtubeMedia;
}

function normalizeTrack(raw: unknown, index: number, provider: MusicProvider): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.artist !== "string" || !value.artist.trim()) return null;

  const media = readMedia(value.media, provider, value);
  const durationMs = typeof value.durationMs === "number" && value.durationMs > 0 ? value.durationMs : 180000;
  const previewDurationMs = media?.provider === "deezer" ? media.previewDurationMs ?? 30000 : undefined;
  const defaults = media?.provider === "deezer"
    ? defaultDeezerClipWindow(previewDurationMs)
    : defaultClipWindow(durationMs);
  const startValue = typeof value.startTime === "number" && Number.isFinite(value.startTime)
    ? value.startTime
    : defaults.startTime;
  const endValue = typeof value.endTime === "number" && Number.isFinite(value.endTime)
    ? value.endTime
    : defaults.endTime;
  const startTime = media?.provider === "deezer"
    ? Math.max(0, Math.min(startValue, Math.max(0, (previewDurationMs ?? 30000) / 1000 - 1)))
    : Math.max(0, startValue);
  const endTime = media?.provider === "deezer"
    ? Math.min(Math.max(startTime + 1, endValue), (previewDurationMs ?? 30000) / 1000)
    : Math.max(startTime + 1, endValue);
  const statusValue = value.matchStatus;
  const matchStatus: MatchStatus =
    typeof statusValue === "string" && ["pending", "matched", "failed", "manual"].includes(statusValue)
      ? statusValue as MatchStatus
      : media?.provider === "deezer" && !media.previewUrl
        ? "failed"
        : media
          ? "matched"
          : "pending";

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `track-${index}-${Math.random().toString(36).slice(2, 8)}`,
    title: value.title.trim(),
    artist: value.artist.trim(),
    album: typeof value.album === "string" ? value.album.trim() : "",
    albumArtUrl: typeof value.albumArtUrl === "string" ? value.albumArtUrl.trim() : "",
    durationMs,
    media,
    startTime,
    endTime,
    matchStatus,
  };
}

function normalizeDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name.trim() || !Array.isArray(value.tracks)) return null;
  const provider = providerFrom(value.provider);
  const tracks = value.tracks
    .map((track, index) => normalizeTrack(track, index, provider))
    .filter((track): track is Track => track !== null);
  if (tracks.length !== value.tracks.length) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: typeof value.id === "string" && value.id.trim() ? value.id : `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: value.name.trim(),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
    provider,
    source: value.source && typeof value.source === "object" ? value.source as DeckSource : { type: "manual" },
    tracks,
  };
}

function ensureDefaultDeezerSample(decks: Deck[]): Deck[] {
  try {
    if (!decks.some((deck) => deck.id === SAMPLE_POP_HITS_DECK.id)) return decks;

    const existingIndex = decks.findIndex((deck) => deck.id === SAMPLE_DEEZER_DECK.id);
    const existing = existingIndex >= 0 ? decks[existingIndex] : null;
    const needsSampleUpgrade = existing?.source?.type === "sample"
      && existing.tracks.length === SAMPLE_DEEZER_DECK.tracks.length
      && existing.tracks.every((track) => track.id.startsWith("deezer-sample-") && !track.media);

    if (needsSampleUpgrade) {
      const upgraded = normalizeDeck(SAMPLE_DEEZER_DECK);
      if (upgraded) {
        const next = [...decks];
        next[existingIndex] = upgraded;
        localStorage.setItem(DEFAULT_DEEZER_SAMPLE_SEEDED_KEY, "1");
        return next;
      }
    }

    if (existing) return decks;
    const seeded = [...decks, normalizeDeck(SAMPLE_DEEZER_DECK)].filter((deck): deck is Deck => deck !== null);
    localStorage.setItem(DEFAULT_DEEZER_SAMPLE_SEEDED_KEY, "1");
    return seeded;
  } catch {
    return decks;
  }
}

export function getStoredDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(DECKS_STORAGE_KEY);
    if (!raw) {
      const initial = [SAMPLE_POP_HITS_DECK, SAMPLE_DEEZER_DECK]
        .map(normalizeDeck)
        .filter((deck): deck is Deck => deck !== null);
      saveStoredDecks(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed.map(normalizeDeck);
      if (normalized.every(Boolean)) {
        const decks = ensureDefaultDeezerSample(normalized as Deck[]);
        if (JSON.stringify(parsed) !== JSON.stringify(decks)) writeLocalStorage(DECKS_STORAGE_KEY, JSON.stringify(decks));
        return decks;
      }
    }
    const fallback = ensureDefaultDeezerSample([SAMPLE_POP_HITS_DECK, SAMPLE_DEEZER_DECK]
      .map(normalizeDeck)
      .filter((deck): deck is Deck => deck !== null));
    saveStoredDecks(fallback);
    return fallback;
  } catch (err) {
    console.error("Failed to parse stored decks from localStorage:", err);
    return ensureDefaultDeezerSample([SAMPLE_POP_HITS_DECK, SAMPLE_DEEZER_DECK]
      .map(normalizeDeck)
      .filter((deck): deck is Deck => deck !== null));
  }
}

export function saveStoredDecks(decks: Deck[]): void {
  writeLocalStorage(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export function getDeckById(id: string): Deck | null {
  return getStoredDecks().find((deck) => deck.id === id) || null;
}

export function saveDeck(deck: Deck): Deck {
  const decks = getStoredDecks();
  const index = decks.findIndex((item) => item.id === deck.id);
  const updatedDeck: Deck = { ...deck, schemaVersion: 2, updatedAt: new Date().toISOString() };
  if (index !== -1) decks[index] = updatedDeck;
  else decks.unshift(updatedDeck);
  saveStoredDecks(decks);
  return updatedDeck;
}

export function deleteDeck(id: string): void {
  saveStoredDecks(getStoredDecks().filter((deck) => deck.id !== id));
}

function nextCopyName(baseName: string, existingNames: string[]): string {
  const firstCopy = `${baseName} (Copy)`;
  if (!existingNames.includes(firstCopy)) return firstCopy;
  let n = 2;
  while (existingNames.includes(`${baseName} (Copy ${n})`)) n++;
  return `${baseName} (Copy ${n})`;
}

export function duplicateDeck(id: string): Deck | null {
  const deck = getDeckById(id);
  if (!deck) return null;
  const now = new Date().toISOString();
  return saveDeck({
    ...deck,
    id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: nextCopyName(deck.name, getStoredDecks().map((item) => item.name)),
    createdAt: now,
    updatedAt: now,
    tracks: deck.tracks.map((track, index) => ({
      ...track,
      id: `track-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
    })),
  });
}

export interface SerializedDeckExport {
  filename: string;
  exportObject: Record<string, unknown>;
  jsonText: string;
}

export function serializeDeckForExport(deck: Deck): SerializedDeckExport {
  const canonical = buildCanonicalSharePayload(deck);
  const songs = deck.tracks.map((track) => {
    const entry: Record<string, unknown> = {
      title: track.title,
      artist: track.artist,
      start: track.startTime,
      end: track.endTime,
    };
    if (track.album) entry.album = track.album;
    if (track.media) entry.media = track.media;
    return entry;
  });
  const exportObject = {
    format: canonical.format,
    schemaVersion: 2,
    provider: deck.provider,
    name: deck.name,
    exportedAt: new Date().toISOString(),
    songs,
  };
  return {
    filename: `${slugifyFilename(deck.name)}-deck.json`,
    exportObject,
    jsonText: `${JSON.stringify(exportObject, null, 2)}\n`,
  };
}

export function exportDeckToJson(deck: Deck): void {
  const { filename, jsonText } = serializeDeckForExport(deck);
  downloadTextFile(filename, jsonText, "application/json");
}

export interface SchemaValidationResult {
  isValid: boolean;
  error?: string;
  deck?: Deck;
}

function parseExportedSong(raw: unknown, index: number, provider: MusicProvider): { track: Track } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: `Song at index ${index} is invalid.` };
  const song = raw as Record<string, unknown>;
  if (typeof song.title !== "string" || !song.title.trim()) return { error: `Song at index ${index} is missing a title.` };
  if (typeof song.artist !== "string" || !song.artist.trim()) return { error: `Song '${song.title}' is missing an artist.` };

  const media = readMedia(song.media, provider, song);
  const durationMs = typeof song.durationMs === "number" && song.durationMs > 0 ? song.durationMs : 180000;
  const defaults = media?.provider === "deezer"
    ? defaultDeezerClipWindow(media.previewDurationMs)
    : defaultClipWindow(durationMs);
  const startTime = typeof song.start === "number" && song.start >= 0 ? song.start : defaults.startTime;
  const endCandidate = typeof song.end === "number" ? song.end : defaults.endTime;
  const track = createTrack({
    title: song.title,
    artist: song.artist,
    album: typeof song.album === "string" ? song.album : "",
    albumArtUrl: typeof song.albumArtUrl === "string" ? song.albumArtUrl : "",
    durationMs,
    media,
    matchStatus: media?.provider === "deezer" && !media.previewUrl ? "failed" : media ? "matched" : "pending",
  });
  track.startTime = media?.provider === "deezer" ? Math.max(0, Math.min(startTime, 29)) : startTime;
  track.endTime = media?.provider === "deezer"
    ? Math.min(Math.max(track.startTime + 1, endCandidate), (media.previewDurationMs ?? 30000) / 1000)
    : Math.max(track.startTime + 1, endCandidate);
  return { track };
}

export function validateDeckSchema(data: unknown): SchemaValidationResult {
  if (!data || typeof data !== "object") return { isValid: false, error: "Invalid JSON format: Expected a JSON object." };
  const obj = data as Record<string, unknown>;
  const version = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1;
  if (version !== 1 && version !== 2) return { isValid: false, error: "Missing or unsupported schemaVersion (expected 1 or 2)." };
  if (version === 2 && obj.provider !== "youtube" && obj.provider !== "deezer") {
    return { isValid: false, error: "Schema v2 decks must declare provider 'youtube' or 'deezer'." };
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) return { isValid: false, error: "Deck must have a non-empty 'name' field." };

  const provider = version === 1 ? "youtube" : providerFrom(obj.provider);
  const songs = Array.isArray(obj.songs) ? obj.songs : null;
  const tracks = Array.isArray(obj.tracks) ? obj.tracks : null;
  const source = songs && songs.length > 0 ? songs : tracks;
  if (!source || source.length === 0) return { isValid: false, error: "Deck must include a non-empty 'songs' or 'tracks' list." };

  const sanitizedTracks: Track[] = [];
  for (let index = 0; index < source.length; index++) {
    const parsed = parseExportedSong(source[index], index, provider);
    if ("error" in parsed) return { isValid: false, error: parsed.error };
    sanitizedTracks.push(parsed.track);
  }

  const now = new Date().toISOString();
  return {
    isValid: true,
    deck: {
      schemaVersion: 2,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: obj.name.trim(),
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : now,
      updatedAt: now,
      provider,
      source: obj.source && typeof obj.source === "object" ? obj.source as DeckSource : { type: "manual" },
      tracks: sanitizedTracks,
    },
  };
}

export function importDeckFromData(data: unknown): Deck {
  const validation = validateDeckSchema(data);
  if (!validation.isValid || !validation.deck) throw new Error(validation.error || "Invalid deck JSON schema.");
  return saveDeck(validation.deck);
}

export function parseAndImportDeckFile(file: File): Promise<Deck> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return reject(new Error("File is empty."));
        resolve(importDeckFromData(JSON.parse(text)));
      } catch (err) {
        reject(new Error("Failed to parse JSON file: " + (err as Error).message));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file from disk."));
    reader.readAsText(file);
  });
}
