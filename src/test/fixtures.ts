import type { Deck, Track } from "../types/deck";

export function makeTrack(partial: Partial<Track> & Pick<Track, "id">): Track {
  return {
    title: `Song ${partial.id}`,
    artist: `Artist ${partial.id}`,
    album: "",
    albumArtUrl: "",
    durationMs: 180_000,
    media: { provider: "youtube", id: "dQw4w9WgXcQ" },
    startTime: 30,
    endTime: 45,
    matchStatus: "matched",
    ...partial,
  };
}

export function makeDeck(tracks: Track[], partial: Partial<Deck> = {}): Deck {
  return {
    schemaVersion: 2,
    id: "deck-test",
    name: "Party",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    provider: "youtube",
    tracks,
    ...partial,
  };
}
