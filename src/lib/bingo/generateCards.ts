import { Track, BingoCard, BingoCardCell, BingoCardOptions } from "../../types/deck";
import {
  DEFAULT_CELL_CONTENT,
  cellContentPool,
  normalizeCellContent,
} from "./cellContent";

export const MIN_GRID_SIZE = 3;
export const MAX_GRID_SIZE = 6;
export const GRID_SIZES = [3, 4, 5, 6] as const;

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

export function generateSingleBingoCard(
  tracks: Track[],
  cardNumber: number,
  options: Pick<BingoCardOptions, "gridSize" | "bingoPercent" | "cellContent">
): BingoCard {
  const selection = normalizeCellContent(options.cellContent ?? DEFAULT_CELL_CONTENT);
  const pool = cellContentPool(tracks, selection);
  if (pool.length === 0) {
    throw new Error("Cannot generate bingo card from an empty track list.");
  }

  const gridSize = normalizeGridSize(options.gridSize);
  const slots = cellCount(gridSize);
  const filledCount = uniqueSongCount(pool.length, slots, options.bingoPercent);
  const picked = shuffleArray(pool).slice(0, filledCount);
  const filledPositions = new Set(
    shuffleArray(Array.from({ length: slots }, (_, i) => i)).slice(0, filledCount)
  );

  const grid: BingoCardCell[] = [];
  let pickIdx = 0;
  for (let i = 0; i < slots; i++) {
    if (filledPositions.has(i)) {
      grid.push({
        isBlank: false,
        track: picked[pickIdx++] || null,
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

  const selection = normalizeCellContent(options.cellContent ?? DEFAULT_CELL_CONTENT);
  const pool = cellContentPool(tracks, selection);
  if (pool.length === 0) return [];

  const cards: BingoCard[] = [];
  const count = Math.max(1, Math.min(200, options.cardCount));

  for (let i = 1; i <= count; i++) {
    cards.push(
      generateSingleBingoCard(tracks, i, {
        gridSize: options.gridSize,
        bingoPercent: options.bingoPercent,
        cellContent: selection,
      })
    );
  }

  return cards;
}
