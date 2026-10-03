import { Track } from "../../types/deck";
import {
  DEFAULT_CELL_CONTENT,
  cellContentPool,
  parseStoredCellContent,
} from "./cellContent";
import { getLargestValidGridSize, isGridSizeValidForDeck } from "../decks/readiness";

/** Same key Cards writes: `bingo.cards.settings.{deckId}`. */
export const CARD_SETTINGS_KEY = "bingo.cards.settings";

export type StoredCardSettings = {
  cardCount?: unknown;
  gridSize?: unknown;
  cellContent?: unknown;
};

export type CardEstimateInputs = {
  poolCount: number;
  gridSize: number;
  cardCount: number;
  averageClipSeconds: number;
};

/**
 * Read Cards' saved print settings. Missing or unreadable storage matches
 * Cards treating the deck as having no saved settings.
 */
export function readStoredCardSettings(deckId: string): StoredCardSettings | null {
  try {
    const raw = localStorage.getItem(`${CARD_SETTINGS_KEY}.${deckId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCardSettings | null;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Pool, grid, card count, and average clip length Cards uses for
 * `estimateBingoTimes`. Grid and card count follow the Cards load rules:
 * saved values when present and valid, otherwise 10 cards and the largest
 * grid the deck can fill (5×5 only while that is still the unset default).
 */
export function resolveCardEstimateInputs(
  tracks: Track[],
  stored: StoredCardSettings | null
): CardEstimateInputs {
  const cardCount = typeof stored?.cardCount === "number" ? stored.cardCount : 10;
  const cellContent = parseStoredCellContent(stored?.cellContent) ?? DEFAULT_CELL_CONTENT;
  const poolTracks = cellContentPool(tracks, cellContent);
  const trackCount = tracks.length;

  let gridSize = 5;
  if (stored) {
    const poolSize = poolTracks.length;
    const sizeCandidate =
      typeof stored.gridSize === "number" ? stored.gridSize : getLargestValidGridSize(poolSize);
    gridSize = isGridSizeValidForDeck(poolSize, sizeCandidate)
      ? sizeCandidate
      : getLargestValidGridSize(poolSize);
  } else if (trackCount > 0) {
    gridSize = getLargestValidGridSize(trackCount);
  }

  const averageClipSeconds =
    poolTracks.length === 0
      ? 0
      : poolTracks.reduce(
          (total, track) => total + Math.max(0, track.endTime - track.startTime),
          0
        ) / poolTracks.length;

  return {
    poolCount: poolTracks.length,
    gridSize,
    cardCount,
    averageClipSeconds,
  };
}

/**
 * Songs still to call. Before the first call this is the card pool Cards
 * estimates from. After the first call it is the host shuffle's uncalled
 * count, including 0 when the bag is empty.
 */
export function songsLeftForHost(
  calledCount: number,
  uncalledCount: number,
  poolCount: number
): number {
  if (calledCount > 0) return uncalledCount;
  return poolCount;
}
