import { describe, expect, it } from "vitest";
import {
  estimateBingoTimes,
  expectedFullCardDraws,
  expectedLineDraws,
  formatEstimateDraws,
  formatEstimateDuration,
} from "./estimator";

describe("bingo time estimates", () => {
  it("formats durations and draw counts", () => {
    expect(formatEstimateDuration(0)).toBe("—");
    expect(formatEstimateDuration(-5)).toBe("—");
    expect(formatEstimateDuration(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatEstimateDuration(29)).toBe("under 1 min");
    expect(formatEstimateDuration(30)).toBe("1 min");
    expect(formatEstimateDuration(90)).toBe("2 min");
    expect(formatEstimateDuration(3600)).toBe("1 hr");
    expect(formatEstimateDuration(3660)).toBe("1 hr 1 min");
    expect(formatEstimateDraws(3)).toBe("3.0 songs");
  });

  it("returns exact full-card waits for tiny pools and stays inside the deck", () => {
    expect(expectedFullCardDraws(0, 1, 1)).toBe(0);
    expect(expectedFullCardDraws(2, 3, 1)).toBe(0);
    expect(expectedFullCardDraws(1, 1, 1)).toBeCloseTo(1);
    expect(expectedFullCardDraws(2, 2, 1)).toBeCloseTo(2);
    expect(expectedFullCardDraws(2, 1, 1)).toBeCloseTo(1.5);

    const oneCard = expectedFullCardDraws(5, 3, 1);
    const severalCards = expectedFullCardDraws(5, 3, 4);
    expect(severalCards).toBeGreaterThan(0);
    expect(severalCards).toBeLessThan(oneCard);
    expect(oneCard).toBeLessThanOrEqual(5);
  });

  it("expects a line before a full card and scales time by the clip length", () => {
    const line = expectedLineDraws(9, 3, 3, 1);
    const full = expectedFullCardDraws(9, 9, 1);
    expect(line).toBeGreaterThan(0);
    expect(line).toBeLessThan(full);
    expect(expectedLineDraws(9, 3, 3, 1)).toBeCloseTo(line);
    expect(expectedLineDraws(9, 3, 3, 6)).toBeLessThan(line);
    expect(expectedLineDraws(0, 3, 3, 1)).toBe(0);

    const estimate = estimateBingoTimes(9, 3, 3, 4, 15);
    expect(estimate.line.estimatedSeconds).toBeCloseTo(estimate.line.expectedDraws * 15);
    expect(estimate.fullCard.expectedDraws).toBeGreaterThan(estimate.line.expectedDraws);
    expect(estimateBingoTimes(9, 3, 3, 4, -10).line.estimatedSeconds).toBe(0);
  });
});
