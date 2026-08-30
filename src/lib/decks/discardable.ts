export function isEmptyDeck(deck: { tracks: unknown[] }): boolean {
  return deck.tracks.length === 0;
}

export function isDiscardableDeck(deck: { tracks: unknown[] }): boolean {
  return isEmptyDeck(deck);
}

export const EMPTY_DECK_ACTION_TITLE = "Add songs to the deck first";
