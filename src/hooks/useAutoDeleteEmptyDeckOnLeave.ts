import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { getDeckById } from "../lib/storage/decks";
import { isDiscardableDeck } from "../lib/decks/discardable";

function getDeckIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/deck\/([^/]+)/);
  return match?.[1] ?? null;
}

export function useAutoDeleteEmptyDeckOnLeave(): void {
  const location = useLocation();
  const { deleteDeck } = useDeck();
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = location.pathname;
    prevPathRef.current = currentPath;

    const leftDeckId = getDeckIdFromPath(prevPath);
    if (!leftDeckId) return;

    const stillInSameDeck = currentPath.startsWith(`/deck/${leftDeckId}`);
    if (stillInSameDeck) return;

    const leftDeck = getDeckById(leftDeckId);
    if (leftDeck && isDiscardableDeck(leftDeck)) {
      deleteDeck(leftDeckId);
    }
  }, [location.pathname, deleteDeck]);
}
