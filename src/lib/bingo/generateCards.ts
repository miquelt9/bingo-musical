import { Track, BingoCard, BingoCardCell, BingoCardOptions } from "../../types/deck";

// Fisher-Yates array shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateSingleBingoCard(
  tracks: Track[],
  cardNumber: number,
  includeFreeSpace = true
): BingoCard {
  if (tracks.length === 0) {
    throw new Error("Cannot generate bingo card from an empty track list.");
  }

  // Shuffle available tracks
  let pool = shuffleArray(tracks);

  // If fewer than 24 tracks, repeat the pool to fill 24 slots
  const neededSlots = includeFreeSpace ? 24 : 25;
  while (pool.length < neededSlots) {
    pool = [...pool, ...shuffleArray(tracks)];
  }

  const selectedTracks = pool.slice(0, neededSlots);
  const grid: BingoCardCell[] = [];

  let trackIdx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const isCenter = row === 2 && col === 2;

      if (isCenter && includeFreeSpace) {
        grid.push({
          isFreeSpace: true,
          track: null,
        });
      } else {
        grid.push({
          isFreeSpace: false,
          track: selectedTracks[trackIdx++] || null,
        });
      }
    }
  }

  return {
    id: `card-${cardNumber}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    cardNumber,
    grid,
  };
}

export function generateBingoCards(
  tracks: Track[],
  options: BingoCardOptions
): BingoCard[] {
  const cards: BingoCard[] = [];
  const count = Math.max(1, Math.min(200, options.cardCount));

  for (let i = 1; i <= count; i++) {
    cards.push(generateSingleBingoCard(tracks, i, options.includeFreeSpace));
  }

  return cards;
}
