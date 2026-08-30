import { Deck, Track, MatchStatus } from "../../types/deck";
import { SAMPLE_POP_HITS_DECK } from "./mockDeck";
import { parseYoutubeVideoId, getYoutubeWatchUrl } from "../youtube/parseUrl";
import { createTrack } from "../tracks";
import { downloadTextFile, slugifyFilename } from "./download";

const DECKS_STORAGE_KEY = "bingo-musical:decks";

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

export function getStoredDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(DECKS_STORAGE_KEY);
    if (!raw) {
      // Seed with sample deck on fresh run
      const initial = [SAMPLE_POP_HITS_DECK];
      saveStoredDecks(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    // If empty array was stored, re-seed with sample deck
    saveStoredDecks([SAMPLE_POP_HITS_DECK]);
    return [SAMPLE_POP_HITS_DECK];
  } catch (err) {
    console.error("Failed to parse stored decks from localStorage:", err);
    return [SAMPLE_POP_HITS_DECK];
  }
}

export function saveStoredDecks(decks: Deck[]): void {
  writeLocalStorage(DECKS_STORAGE_KEY, JSON.stringify(decks));
}

export function getDeckById(id: string): Deck | null {
  const decks = getStoredDecks();
  return decks.find((d) => d.id === id) || null;
}

export function saveDeck(deck: Deck): Deck {
  const decks = getStoredDecks();
  const index = decks.findIndex((d) => d.id === deck.id);
  const updatedDeck: Deck = {
    ...deck,
    updatedAt: new Date().toISOString(),
  };

  if (index !== -1) {
    decks[index] = updatedDeck;
  } else {
    decks.unshift(updatedDeck);
  }

  saveStoredDecks(decks);
  return updatedDeck;
}

export function deleteDeck(id: string): void {
  const decks = getStoredDecks();
  const filtered = decks.filter((d) => d.id !== id);
  saveStoredDecks(filtered);
}

export function duplicateDeck(id: string): Deck | null {
  const deck = getDeckById(id);
  if (!deck) return null;

  const now = new Date().toISOString();
  const newDeck: Deck = {
    ...deck,
    id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: `${deck.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    tracks: deck.tracks.map((t, index) => ({
      ...t,
      id: `track-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
    })),
  };

  return saveDeck(newDeck);
}

export interface SerializedDeckExport {
  filename: string;
  exportObject: Record<string, unknown>;
  jsonText: string;
}

export function serializeDeckForExport(deck: Deck): SerializedDeckExport {
  const songs = deck.tracks.map((track) => {
    const song: Record<string, unknown> = {
      title: track.title,
      artist: track.artist,
    };
    if (track.album) song.album = track.album;
    if (track.youtubeVideoId) {
      song.youtube = getYoutubeWatchUrl(track.youtubeVideoId, track.startTime);
    }
    song.start = track.startTime;
    song.end = track.endTime;
    return song;
  });

  const exportObject = {
    format: "bingo-musical-deck",
    schemaVersion: 1,
    name: deck.name,
    exportedAt: new Date().toISOString(),
    songs,
  };

  const filename = `${slugifyFilename(deck.name)}-deck.json`;
  const jsonText = `${JSON.stringify(exportObject, null, 2)}\n`;

  return { filename, exportObject, jsonText };
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

function parseExportedSong(raw: unknown, index: number): { track: Track } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: `Song at index ${index} is invalid.` };
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.title !== "string" || !s.title.trim()) {
    return { error: `Song at index ${index} is missing a title.` };
  }
  if (typeof s.artist !== "string" || !s.artist.trim()) {
    return { error: `Song '${s.title}' is missing an artist.` };
  }

  const youtubeRaw = [s.youtube, s.youtubeVideoId, s.url].find((v) => typeof v === "string" && v.trim()) as
    | string
    | undefined;
  const youtubeVideoId = youtubeRaw ? parseYoutubeVideoId(youtubeRaw) : null;
  const startTime =
    typeof s.start === "number" && s.start >= 0
      ? s.start
      : typeof s.startTime === "number" && s.startTime >= 0
        ? s.startTime
        : 30;
  const endCandidate =
    typeof s.end === "number"
      ? s.end
      : typeof s.endTime === "number"
        ? s.endTime
        : startTime + 15;

  const track = createTrack({
    title: s.title,
    artist: s.artist,
    album: typeof s.album === "string" ? s.album : "",
    youtubeVideoId,
    matchStatus: youtubeVideoId ? "matched" : "pending",
  });
  track.startTime = startTime;
  track.endTime = Math.max(startTime + 1, endCandidate);
  return { track };
}

export function validateDeckSchema(data: unknown): SchemaValidationResult {
  if (!data || typeof data !== "object") {
    return { isValid: false, error: "Invalid JSON format: Expected a JSON object." };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.schemaVersion === "number" && obj.schemaVersion !== 1) {
    return { isValid: false, error: "Missing or unsupported schemaVersion (expected 1)." };
  }

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { isValid: false, error: "Deck must have a non-empty 'name' field." };
  }

  const songList = Array.isArray(obj.songs) ? obj.songs : null;
  const trackList = Array.isArray(obj.tracks) ? obj.tracks : null;
  const useSongs = Boolean(songList && (obj.format === "bingo-musical-deck" || !trackList));

  if ((!trackList || trackList.length === 0) && (!songList || songList.length === 0)) {
    return { isValid: false, error: "Deck must include a non-empty 'songs' or 'tracks' list." };
  }

  const sanitizedTracks: Track[] = [];

  if (useSongs && songList) {
    for (let i = 0; i < songList.length; i++) {
      const parsed = parseExportedSong(songList[i], i);
      if ("error" in parsed) {
        return { isValid: false, error: parsed.error };
      }
      sanitizedTracks.push(parsed.track);
    }
  } else {
    for (let i = 0; i < (trackList as unknown[]).length; i++) {
      const t = (trackList as unknown[])[i] as Record<string, unknown>;
      if (!t || typeof t !== "object") {
        return { isValid: false, error: `Track at index ${i} is invalid.` };
      }

      if (typeof t.title !== "string" || !t.title.trim()) {
        return { isValid: false, error: `Track at index ${i} is missing a title.` };
      }

      if (typeof t.artist !== "string" || !t.artist.trim()) {
        return { isValid: false, error: `Track '${t.title}' is missing an artist.` };
      }

      const startTime = typeof t.startTime === "number" && !isNaN(t.startTime) && t.startTime >= 0 ? t.startTime : 30;
      const endTime = typeof t.endTime === "number" && !isNaN(t.endTime) && t.endTime > startTime ? t.endTime : startTime + 15;
      const youtubeVideoId = typeof t.youtubeVideoId === "string" && t.youtubeVideoId.trim() ? t.youtubeVideoId.trim() : null;

      let matchStatus: MatchStatus = "pending";
      if (typeof t.matchStatus === "string" && ["pending", "matched", "failed", "manual"].includes(t.matchStatus)) {
        matchStatus = t.matchStatus as MatchStatus;
      } else if (youtubeVideoId) {
        matchStatus = "matched";
      }

      sanitizedTracks.push({
        id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `t-${i}-${Math.random().toString(36).substring(2, 7)}`,
        title: t.title.trim(),
        artist: t.artist.trim(),
        album: typeof t.album === "string" ? t.album.trim() : "",
        albumArtUrl: typeof t.albumArtUrl === "string" ? t.albumArtUrl.trim() : "",
        durationMs: typeof t.durationMs === "number" ? t.durationMs : 180000,
        youtubeVideoId,
        youtubeTitle: typeof t.youtubeTitle === "string" ? t.youtubeTitle : undefined,
        startTime,
        endTime,
        matchStatus,
      });
    }
  }

  const now = new Date().toISOString();
  const deckId = `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const sanitizedDeck: Deck = {
    schemaVersion: 1,
    id: deckId,
    name: (obj.name as string).trim(),
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : now,
    updatedAt: now,
    source: obj.source && typeof obj.source === "object" ? (obj.source as Deck["source"]) : { type: "manual" },
    tracks: sanitizedTracks,
  };

  return { isValid: true, deck: sanitizedDeck };
}

export function importDeckFromData(data: unknown): Deck {
  const validation = validateDeckSchema(data);
  if (!validation.isValid || !validation.deck) {
    throw new Error(validation.error || "Invalid deck JSON schema.");
  }

  return saveDeck(validation.deck);
}

export function parseAndImportDeckFile(file: File): Promise<Deck> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error("File is empty."));
          return;
        }

        const parsed = JSON.parse(text);
        const saved = importDeckFromData(parsed);
        resolve(saved);
      } catch (err) {
        reject(new Error("Failed to parse JSON file: " + (err as Error).message));
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file from disk."));
    };

    reader.readAsText(file);
  });
}
