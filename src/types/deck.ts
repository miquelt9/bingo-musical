export type MatchStatus = "pending" | "matched" | "failed" | "manual";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  durationMs: number;
  youtubeVideoId: string | null;
  youtubeTitle?: string;
  startTime: number;       // seconds (e.g. 30)
  endTime: number;         // seconds (e.g. 45)
  matchStatus: MatchStatus;
}

export interface DeckSource {
  type: "spotify-playlist" | "youtube-playlist" | "song-list" | "manual" | "sample";
  playlistId?: string;
  url?: string;
  name?: string;
}

export interface Deck {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source?: DeckSource;
  tracks: Track[];
}

export interface BingoCardCell {
  isBlank: boolean;
  track: Track | null;
}

export interface BingoCard {
  id: string;
  cardNumber: number;
  gridSize: number;
  grid: BingoCardCell[]; // gridSize × gridSize cells
}

export interface BingoCardOptions {
  deckName: string;
  customTitle?: string;
  cardCount: number;
  gridSize: number;
  /** Percent of the deck sampled onto each card (1–100). Remaining squares become blank tiles. */
  bingoPercent: number;
}
