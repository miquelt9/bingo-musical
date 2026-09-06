import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { useToast } from "../state/ToastContext";
import { Deck } from "../types/deck";

export function useDeckRoute(): {
  id: string | undefined;
  deck: Deck | null;
  isLoading: boolean;
  notFound: boolean;
} {
  const { id } = useParams<{ id: string }>();
  const { decks, loadDeck, isLoading } = useDeck();
  const { showToast } = useToast();
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (id) loadDeck(id);
  }, [id, loadDeck]);

  const deck = id ? decks.find((d) => d.id === id) ?? null : null;
  const notFound = Boolean(id && !isLoading && !deck);

  useEffect(() => {
    if (!notFound || !id || notifiedRef.current === id) return;
    notifiedRef.current = id;
    showToast({
      title: "Deck not found",
      message: "That deck may have been deleted or the link is invalid.",
      duration: 5000,
    });
  }, [notFound, id, showToast]);

  useEffect(() => {
    if (deck) notifiedRef.current = null;
  }, [deck]);

  return { id, deck, isLoading, notFound };
}
