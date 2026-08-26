import { Deck, Track, MatchStatus } from "../../types/deck";
import { SAMPLE_POP_HITS_DECK } from "./mockDeck";

const DECKS_STORAGE_KEY = "bingo-musical:decks";

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
  localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
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
    tracks: deck.tracks.map((t) => ({ ...t, id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` })),
  };

  return saveDeck(newDeck);
}

export function exportDeckToJson(deck: Deck): void {
  const exportData = {
    ...deck,
    exportedAt: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const cleanName = deck.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const a = document.createElement("a");
  a.href = url;
  a.download = `${cleanName || "musical-bingo"}-deck.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface SchemaValidationResult {
  isValid: boolean;
  error?: string;
  deck?: Deck;
}

export function validateDeckSchema(data: unknown): SchemaValidationResult {
  if (!data || typeof data !== "object") {
    return { isValid: false, error: "Invalid JSON format: Expected a JSON object." };
  }

  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1 && typeof obj.schemaVersion !== "number") {
    return { isValid: false, error: "Missing or unsupported schemaVersion (expected 1)." };
  }

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { isValid: false, error: "Deck must have a non-empty 'name' field." };
  }

  if (!Array.isArray(obj.tracks) || obj.tracks.length === 0) {
    return { isValid: false, error: "Deck must include a non-empty 'tracks' list." };
  }

  const sanitizedTracks: Track[] = [];

  for (let i = 0; i < obj.tracks.length; i++) {
    const t = obj.tracks[i] as Record<string, unknown>;
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

  const now = new Date().toISOString();
  const deckId = typeof obj.id === "string" && obj.id.trim()
    ? `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    : `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

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
        const validation = validateDeckSchema(parsed);

        if (!validation.isValid || !validation.deck) {
          reject(new Error(validation.error || "Invalid deck JSON schema."));
          return;
        }

        const saved = saveDeck(validation.deck);
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
