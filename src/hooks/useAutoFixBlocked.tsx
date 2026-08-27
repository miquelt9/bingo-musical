import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { batchMatchTracks, BatchMatchProgress } from "../lib/youtube/matcher";
import { getUnplayableTracks, BatchValidationProgress } from "../lib/youtube/validator";
import { ensureDeckPlayable } from "../lib/youtube/playabilityGate";
import { useDeck } from "../state/DeckContext";
import { useToast } from "../state/ToastContext";
import { Deck } from "../types/deck";

interface UseAutoFixBlockedOptions {
  onDeckUpdate?: (deck: Deck) => void;
  onViewProblems?: () => void;
}

export function useAutoFixBlocked(
  deck: Deck | null,
  options: UseAutoFixBlockedOptions = {}
) {
  const { updateDeck } = useDeck();
  const { showToast } = useToast();
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<BatchMatchProgress | null>(null);
  const [validationProgress, setValidationProgress] = useState<BatchValidationProgress | null>(null);
  const cancelMatchingRef = useRef(false);
  const deckRef = useRef(deck);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  const applyDeckUpdate = useCallback(
    (nextDeck: Deck) => {
      updateDeck(nextDeck);
      options.onDeckUpdate?.(nextDeck);
    },
    [updateDeck, options.onDeckUpdate]
  );

  const handleAutoFixBlocked = useCallback(async () => {
    const currentDeck = deckRef.current;
    if (!currentDeck) return;

    const blockedTrackIds = new Set(getUnplayableTracks(currentDeck.tracks).map((t) => t.id));
    if (blockedTrackIds.size === 0) return;

    const preparedTracks = currentDeck.tracks.map((t) => {
      if (blockedTrackIds.has(t.id)) {
        return {
          ...t,
          youtubeVideoId: null,
          matchStatus: "pending" as const,
        };
      }
      return t;
    });

    setIsMatching(true);
    cancelMatchingRef.current = false;

    try {
      const updatedTracks = await batchMatchTracks(
        preparedTracks,
        2,
        (progress, updatedTrack) => {
          setMatchProgress(progress);
          const latestDeck = deckRef.current;
          if (!latestDeck) return;
          const nextTracks = latestDeck.tracks.map((t) =>
            t.id === updatedTrack.id ? updatedTrack : t
          );
          applyDeckUpdate({ ...latestDeck, tracks: nextTracks });
        },
        () => cancelMatchingRef.current
      );

      const finalDeck = { ...currentDeck, tracks: updatedTracks };
      applyDeckUpdate(finalDeck);

      const recheck = await ensureDeckPlayable(updatedTracks, {
        onProgress: setValidationProgress,
      });

      if (recheck.invalidTracks.length > 0) {
        const invalidIds = new Set(recheck.invalidTracks.map((i) => i.track.id));
        const markedTracks = updatedTracks.map((track) =>
          invalidIds.has(track.id) ? { ...track, matchStatus: "failed" as const } : track
        );
        applyDeckUpdate({ ...finalDeck, tracks: markedTracks });
      }

      if (recheck.playable) {
        showToast({
          title: "Auto-Fix Complete",
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
          message: "All songs verified! Replaced restricted tracks with playable alternatives.",
          duration: 8000,
        });
      } else {
        showToast({
          title: "Auto-Fix Complete",
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          message: `Auto-fix complete, but ${recheck.invalidTracks.length} song${
            recheck.invalidTracks.length > 1 ? "s" : ""
          } still need attention.`,
          duration: 12000,
          actions: options.onViewProblems
            ? [
                {
                  id: "view-problems",
                  label: "View Problems",
                  variant: "primary" as const,
                  onClick: options.onViewProblems,
                },
              ]
            : undefined,
        });
      }
    } catch (err) {
      console.error("Auto-fix error:", err);
    } finally {
      setIsMatching(false);
      setMatchProgress(null);
      setValidationProgress(null);
    }
  }, [applyDeckUpdate, showToast, options.onViewProblems]);

  return {
    handleAutoFixBlocked,
    isMatching,
    matchProgress,
    validationProgress,
  };
}
