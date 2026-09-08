export function isEmptyDeck(deck: { tracks: unknown[] }): boolean {
  return deck.tracks.length === 0;
}

export function isDiscardableDeck(deck: { tracks: unknown[] }): boolean {
  return isEmptyDeck(deck);
}

/** Default auto-named empty decks that were never filled. */
export function isAbandonedEmptyDeck(deck: {
  name: string;
  tracks: unknown[];
  source?: { type?: string };
}): boolean {
  if (!isEmptyDeck(deck)) return false;
  if (deck.source?.type === "sample") return false;
  return /^new deck(\s+\d+)?$/i.test(deck.name.trim());
}

export const EMPTY_DECK_ACTION_TITLE = "Add songs to the deck first";
