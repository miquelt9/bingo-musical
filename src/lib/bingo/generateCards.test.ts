import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import type { BingoCardOptions } from "../../types/deck";
import {
  cellCount,
  createSeededRandom,
  generateBingoCards,
  generateSingleBingoCard,
  isBlankCell,
  normalizeBingoPercent,
  normalizeGridSize,
  shuffleArray,
  uniqueSongCount,
} from "./generateCards";

function songs(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeTrack({ id: `t${index + 1}`, title: `Song ${index + 1}`, artist: `Artist ${index + 1}` }),
  );
}

const songsOnly = { numbers: false, songs: true, authors: false };

describe("bingo card generation", () => {
  it("clamps grid size, bingo percent, and songs placed on a card", () => {
    expect(normalizeGridSize(2)).toBe(3);
    expect(normalizeGridSize(3.4)).toBe(3);
    expect(normalizeGridSize(6.6)).toBe(6);
    expect(normalizeGridSize(0)).toBe(5);
    expect(normalizeBingoPercent(140)).toBe(100);
    expect(normalizeBingoPercent(0.4)).toBe(1);
    expect(normalizeBingoPercent(0)).toBe(100);
    expect(cellCount(4)).toBe(16);

    expect(uniqueSongCount(0, 9, 100)).toBe(0);
    expect(uniqueSongCount(40, 9, 100)).toBe(9);
    expect(uniqueSongCount(40, 25, 50)).toBe(20);
    expect(uniqueSongCount(10, 25, 1)).toBe(1);
  });

  it("shuffles a copy and repeats a seeded sequence", () => {
    const input = [1, 2, 3, 4];
    const shuffled = shuffleArray(input, () => 0);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(shuffled).toEqual([2, 3, 4, 1]);

    const first = [createSeededRandom("batch")(), createSeededRandom("batch")()];
    const second = [createSeededRandom("batch")(), createSeededRandom("batch")()];
    expect(first).toEqual(second);
    expect(createSeededRandom("batch")()).not.toBe(createSeededRandom("other")());
  });

  it("recreates the same card from a batch seed and leaves the rest blank", () => {
    const tracks = songs(16);
    const options = { gridSize: 4, bingoPercent: 50, cellContent: songsOnly, seed: "print-batch" };
    const first = generateSingleBingoCard(tracks, 7, options);
    const second = generateSingleBingoCard(tracks, 7, options);

    expect(first).toEqual(second);
    expect(first.id).toBe("card-7-print-batch");
    expect(first.grid).toHaveLength(16);
    expect(first.grid.filter(isBlankCell)).toHaveLength(8);
    const filledIds = first.grid.flatMap((cell) => (cell.track ? [cell.track.id] : []));
    expect(new Set(filledIds).size).toBe(8);

    const otherNumber = generateSingleBingoCard(tracks, 8, { ...options, seed: "print-batch:8" });
    expect(otherNumber.grid).not.toEqual(first.grid);
  });

  it("uses one cell per artist when the card shows authors without song titles", () => {
    const tracks = [
      makeTrack({ id: "a1", artist: "Alpha", title: "One" }),
      makeTrack({ id: "a2", artist: " alpha ", title: "Two" }),
      makeTrack({ id: "b1", artist: "Beta", title: "Three" }),
      makeTrack({ id: "b2", artist: "BETA", title: "Four" }),
    ];
    const card = generateSingleBingoCard(tracks, 1, {
      gridSize: 3,
      bingoPercent: 100,
      cellContent: { numbers: false, songs: false, authors: true },
      seed: "authors",
    });

    expect(card.grid.flatMap((cell) => (cell.track ? [cell.track.id] : []))).toEqual(
      expect.arrayContaining(["a1", "b1"]),
    );
    expect(card.grid.filter((cell) => !isBlankCell(cell))).toHaveLength(2);
  });

  it("prints a bounded batch and refuses an empty pool", () => {
    const options: BingoCardOptions = {
      deckName: "Party",
      cardCount: 0,
      gridSize: 3,
      bingoPercent: 100,
      seed: "batch",
      cellContent: songsOnly,
    };
    const one = generateBingoCards(songs(9), options);
    expect(one).toHaveLength(1);
    expect(one[0].id).toBe("card-1-batch:1");

    const capped = generateBingoCards(songs(9), { ...options, cardCount: 250 });
    expect(capped).toHaveLength(200);
    expect(capped[0].grid).toEqual(generateBingoCards(songs(9), { ...options, cardCount: 1 })[0].grid);

    expect(generateBingoCards([], options)).toEqual([]);
    expect(() => generateSingleBingoCard([], 1, options)).toThrow(/empty track list/);
  });
});
