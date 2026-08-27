import { Track, BingoCard, BingoCardCell, BingoCardOptions } from "../../types/deck";

export const MIN_GRID_SIZE = 3;
export const MAX_GRID_SIZE = 6;
export const GRID_SIZES = [3, 4, 5, 6] as const;

const COLUMN_LETTERS = ["B", "I", "N", "G", "O", "★"];

// Fisher-Yates array shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeGridSize(size: number): number {
  const n = Math.round(Number(size) || 5);
  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, n));
}

export function normalizeBingoPercent(percent: number): number {
  const n = Math.round(Number(percent) || 100);
  return Math.min(100, Math.max(1, n));
}

export function cellCount(gridSize: number): number {
  const n = normalizeGridSize(gridSize);
  return n * n;
}

/** How many distinct songs each card is built from. Leftover cells are blank tiles. */
export function uniqueSongCount(
  poolSize: number,
  slots: number,
  bingoPercent: number
): number {
  if (poolSize <= 0 || slots <= 0) return 0;
  const fromPercent = Math.round((poolSize * normalizeBingoPercent(bingoPercent)) / 100);
  return Math.min(slots, poolSize, Math.max(1, fromPercent));
}

export function isBlankCell(cell: BingoCardCell): boolean {
  return cell.isBlank || !cell.track;
}

export function bingoColumnLetters(gridSize: number): string[] {
  return COLUMN_LETTERS.slice(0, normalizeGridSize(gridSize));
}

export function generateSingleBingoCard(
  tracks: Track[],
  cardNumber: number,
  options: Pick<BingoCardOptions, "gridSize" | "bingoPercent">
): BingoCard {
  if (tracks.length === 0) {
    throw new Error("Cannot generate bingo card from an empty track list.");
  }

  const gridSize = normalizeGridSize(options.gridSize);
  const slots = cellCount(gridSize);
  const songCount = uniqueSongCount(tracks.length, slots, options.bingoPercent);
  const songs = shuffleArray(tracks).slice(0, songCount);
  const songPositions = new Set(shuffleArray(Array.from({ length: slots }, (_, i) => i)).slice(0, songCount));

  const grid: BingoCardCell[] = [];
  let songIdx = 0;
  for (let i = 0; i < slots; i++) {
    if (songPositions.has(i)) {
      grid.push({
        isBlank: false,
        track: songs[songIdx++] || null,
      });
    } else {
      grid.push({
        isBlank: true,
        track: null,
      });
    }
  }

  return {
    id: `card-${cardNumber}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    cardNumber,
    gridSize,
    grid,
  };
}

export function generateBingoCards(
  tracks: Track[],
  options: BingoCardOptions
): BingoCard[] {
  if (tracks.length === 0) return [];

  const cards: BingoCard[] = [];
  const count = Math.max(1, Math.min(200, options.cardCount));

  for (let i = 1; i <= count; i++) {
    cards.push(
      generateSingleBingoCard(tracks, i, {
        gridSize: options.gridSize,
        bingoPercent: options.bingoPercent,
      })
    );
  }

  return cards;
}
