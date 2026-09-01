import { useMemo } from "react";
import { useDeck } from "../state/DeckContext";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { getDeckReadiness } from "../lib/decks/readiness";

export interface DeckNavGuards {
  canOpenHost: boolean;
  canOpenCards: boolean;
  hostBlockReason: string | undefined;
  cardsBlockReason: string | undefined;
}

export function useDeckNavGuards(deckId: string | undefined): DeckNavGuards {
  const { decks } = useDeck();

  return useMemo(() => {
    const deck = deckId ? decks.find((d) => d.id === deckId) ?? null : null;

    if (!deck) {
      return {
        canOpenHost: false,
        canOpenCards: false,
        hostBlockReason: undefined,
        cardsBlockReason: undefined,
      };
    }

    const emptyDeck = isEmptyDeck(deck);
    const readiness = getDeckReadiness(deck.tracks);

    let hostBlockReason: string | undefined;
    if (emptyDeck) {
      hostBlockReason = EMPTY_DECK_ACTION_TITLE;
    } else if (readiness.blockedCount > 0) {
      hostBlockReason = "All songs must be playable before hosting";
    } else if (readiness.tooFewForHost) {
      hostBlockReason = `Need at least ${readiness.minHostTracks} playable songs to host`;
    } else if (!readiness.canHost) {
      hostBlockReason = "Some songs need attention before hosting";
    }

    return {
      canOpenHost: !emptyDeck && readiness.canHost,
      canOpenCards: !emptyDeck,
      hostBlockReason,
      cardsBlockReason: emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined,
    };
  }, [deckId, decks]);
}
