export function isDiscardableDeck(deck: { tracks: unknown[] }): boolean {
  return deck.tracks.length === 0;
}
