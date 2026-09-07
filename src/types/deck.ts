export type MatchStatus = "pending" | "matched" | "failed" | "manual";

export type MusicProvider = "youtube" | "deezer";

export type TrackMedia =
  | {
      provider: "youtube";
      id: string;
      providerTitle?: string;
    }
  | {
      provider: "deezer";
      id: string;
      previewUrl: string | null;
      previewDurationMs?: number;
      providerUrl?: string;
    };

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  durationMs: number;
  media: TrackMedia | null;
  startTime: number;       // seconds (e.g. 30)
  endTime: number;         // seconds (e.g. 45)
  matchStatus: MatchStatus;
}

export interface DeckSource {
  type: "spotify-playlist" | "youtube-playlist" | "song-list" | "manual" | "sample" | "converted";
  playlistId?: string;
  url?: string;
  name?: string;
  provider?: MusicProvider;
  convertedFrom?: MusicProvider;
}

export interface Deck {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  provider: MusicProvider;
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

export type { BingoCellContentSelection } from "../lib/bingo/cellContent";
import type { BingoCellContentSelection } from "../lib/bingo/cellContent";

export interface BingoCardOptions {
  deckName: string;
  customTitle?: string;
  cardCount: number;
  gridSize: number;
  /** Percent of the deck sampled onto each card (1–100). Remaining squares become blank tiles. */
  bingoPercent: number;
  /** What each filled cell shows on preview / print / PDF. */
  cellContent?: BingoCellContentSelection;
  /** Share URL printed under a QR code so players can reopen the deck. */
  shareUrl?: string;
}
