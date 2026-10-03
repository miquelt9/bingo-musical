import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import { estimateBingoTimes } from "./estimator";
import {
  CARD_SETTINGS_KEY,
  readStoredCardSettings,
  resolveCardEstimateInputs,
  songsLeftForHost,
} from "./cardEstimateInputs";

function tracks(count: number, clipSeconds = 15) {
  return Array.from({ length: count }, (_, index) =>
    makeTrack({
      id: `t-${index + 1}`,
      artist: index % 2 === 0 ? "Same Artist" : `Artist ${index + 1}`,
      startTime: 10,
      endTime: 10 + clipSeconds,
    })
  );
}

describe("card estimate inputs", () => {
  it("uses the Cards storage key and ignores unreadable settings", () => {
    expect(CARD_SETTINGS_KEY).toBe("bingo.cards.settings");
    localStorage.setItem(`${CARD_SETTINGS_KEY}.deck-a`, "{");
    expect(readStoredCardSettings("deck-a")).toBeNull();
    localStorage.removeItem(`${CARD_SETTINGS_KEY}.deck-a`);
    expect(readStoredCardSettings("deck-a")).toBeNull();
  });

  it("matches Cards defaults when nothing is saved", () => {
    const inputs = resolveCardEstimateInputs(tracks(30), null);
    expect(inputs.cardCount).toBe(10);
    expect(inputs.gridSize).toBe(5);
    expect(inputs.poolCount).toBe(30);
    expect(inputs.averageClipSeconds).toBe(15);
  });

  it("uses the largest grid the deck can fill when nothing is saved", () => {
    expect(resolveCardEstimateInputs(tracks(10), null).gridSize).toBe(3);
    expect(resolveCardEstimateInputs(tracks(0), null)).toMatchObject({
      cardCount: 10,
      gridSize: 5,
      poolCount: 0,
      averageClipSeconds: 0,
    });
  });

  it("reads saved grid, card count, and clip length the way Cards does", () => {
    const inputs = resolveCardEstimateInputs(tracks(12, 20), {
      cardCount: 4,
      gridSize: 3,
      cellContent: { numbers: true, songs: true, authors: true },
    });
    expect(inputs.cardCount).toBe(4);
    expect(inputs.gridSize).toBe(3);
    expect(inputs.poolCount).toBe(12);
    expect(inputs.averageClipSeconds).toBe(20);
  });

  it("uses the author pool when Cards is set to authors only", () => {
    const inputs = resolveCardEstimateInputs(tracks(12), {
      cardCount: 4,
      gridSize: 5,
      cellContent: { numbers: false, songs: false, authors: true },
    });
    expect(inputs.poolCount).toBe(7);
    expect(inputs.gridSize).toBe(3);
  });

  it("drops a saved grid the pool cannot fill, same as Cards", () => {
    const stored = {
      cardCount: 8,
      gridSize: 6,
      cellContent: { numbers: true, songs: true, authors: true },
    };
    const inputs = resolveCardEstimateInputs(tracks(20), stored);
    expect(inputs.gridSize).toBe(4);
    expect(inputs.cardCount).toBe(8);
  });

  it("estimates from the full pool, not from songs already called", () => {
    const inputs = resolveCardEstimateInputs(tracks(9, 15), {
      cardCount: 4,
      gridSize: 3,
    });
    const estimate = estimateBingoTimes(
      inputs.poolCount,
      inputs.gridSize,
      inputs.gridSize,
      inputs.cardCount,
      inputs.averageClipSeconds
    );
    const shrunk = estimateBingoTimes(3, inputs.gridSize, inputs.gridSize, inputs.cardCount, inputs.averageClipSeconds);
    expect(estimate.line.estimatedSeconds).toBeGreaterThan(0);
    expect(estimate.line.expectedDraws).not.toBe(shrunk.line.expectedDraws);
  });
});

describe("songs left", () => {
  it("shows the pool before the first call, then the uncalled count", () => {
    expect(songsLeftForHost(0, 30, 30)).toBe(30);
    expect(songsLeftForHost(0, 30, 12)).toBe(12);
    expect(songsLeftForHost(1, 29, 30)).toBe(29);
    expect(songsLeftForHost(5, 11, 16)).toBe(11);
    expect(songsLeftForHost(30, 0, 30)).toBe(0);
  });
});
