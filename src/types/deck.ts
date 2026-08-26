export type MatchStatus = "pending" | "matched" | "failed" | "manual";

export interface Track {
  id: string;              // Spotify track id or unique id
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
  type: "spotify-playlist" | "manual" | "sample";
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
  isFreeSpace: boolean;
  track: Track | null;
}

export interface BingoCard {
  id: string;
  cardNumber: number;
  grid: BingoCardCell[]; // exactly 25 items for 5x5
}

export interface BingoCardOptions {
  deckName: string;
  customTitle?: string;
  cardCount: number;
  includeFreeSpace: boolean;
  freeSpaceText: string;
}
