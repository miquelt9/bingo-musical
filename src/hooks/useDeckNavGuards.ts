import { useMemo } from "react";
import { useDeck } from "../state/DeckContext";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { getDeckReadiness, MIN_CARDS_TRACKS } from "../lib/decks/readiness";

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
    const tooFewForCards = deck.tracks.length < MIN_CARDS_TRACKS;

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

    let cardsBlockReason: string | undefined;
    if (emptyDeck) {
      cardsBlockReason = EMPTY_DECK_ACTION_TITLE;
    } else if (tooFewForCards) {
      cardsBlockReason = `Need at least ${MIN_CARDS_TRACKS} songs for bingo cards`;
    }

    return {
      canOpenHost: !emptyDeck && readiness.canHost,
      canOpenCards: !emptyDeck && !tooFewForCards,
      hostBlockReason,
      cardsBlockReason,
    };
  }, [deckId, decks]);
}
