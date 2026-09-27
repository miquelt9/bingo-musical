import { describe, expect, it } from "vitest";
import { EMPTY_DECK_ACTION_TITLE, isAbandonedEmptyDeck, isDiscardableDeck, isEmptyDeck } from "./discardable";

describe("discardable decks", () => {
  it("treats only untouched auto-named drafts as abandoned", () => {
    expect(isEmptyDeck({ tracks: [] })).toBe(true);
    expect(isDiscardableDeck({ tracks: [] })).toBe(true);
    expect(isDiscardableDeck({ tracks: [{}] })).toBe(false);

    expect(isAbandonedEmptyDeck({ name: "New deck", tracks: [] })).toBe(true);
    expect(isAbandonedEmptyDeck({ name: "  new DECK  ", tracks: [] })).toBe(true);
    expect(isAbandonedEmptyDeck({ name: "New deck 12", tracks: [] })).toBe(true);
    expect(isAbandonedEmptyDeck({ name: "New deck extra", tracks: [] })).toBe(false);
    expect(isAbandonedEmptyDeck({ name: "New deck", tracks: [{}] })).toBe(false);
    expect(isAbandonedEmptyDeck({ name: "New deck", tracks: [], source: { type: "sample" } })).toBe(false);
    expect(EMPTY_DECK_ACTION_TITLE).toMatch(/Add songs/);
  });
});
