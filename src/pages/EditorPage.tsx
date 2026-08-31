import React, { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button, Input, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { Track, Deck } from "../types/deck";
import { TrackTable } from "../components/tracks/TrackTable";
import { SongSearch } from "../components/tracks/SongSearch";
import { batchMatchTracks, BatchMatchProgress } from "../lib/youtube/matcher";
import {
  validateTracksEmbeddability,
  BatchValidationProgress,
  getCachedEmbedStatus,
  getUnplayableTracks,
} from "../lib/youtube/validator";
import {
  canStartGame,
  ensureDeckPlayable,
  InvalidTrackEntry,
} from "../lib/youtube/playabilityGate";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { PcModal } from "../components/ui/PcModal";
import { PageHeader } from "../components/layout/PageHeader";
import { BackButton } from "../components/ui/BackButton";
import { useToast } from "../state/ToastContext";
import { useAutoFixBlocked } from "../hooks/useAutoFixBlocked";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  Edit3,
  Printer,
  Radio,
  Share2,
  Plus,
  Check,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { decks, activeDeck, loadDeck, updateDeck, shareDeck } = useDeck();
  const statusFilterParam = searchParams.get("filter");
  const autostartMatch = searchParams.get("autostart") === "match";
  const initialStatusFilter =
    statusFilterParam === "blocked" ? "blocked" : "all";

  const [deck, setDeck] = useState<Deck | null>(null);
  const [deckName, setDeckName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<BatchMatchProgress | null>(null);
  const cancelMatchingRef = useRef(false);

  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [addSongRainbowDismissed, setAddSongRainbowDismissed] = useState(false);
  const [hostGateOpen, setHostGateOpen] = useState(false);
  const [hostGateChecking, setHostGateChecking] = useState(false);
  const [hostGateProgress, setHostGateProgress] = useState<BatchValidationProgress | null>(null);
  const [hostGateInvalid, setHostGateInvalid] = useState<InvalidTrackEntry[]>([]);
  const backgroundVerifyRef = useRef<string | null>(null);
  const autostartMatchRef = useRef(false);
  const blockedToastShownRef = useRef(false);

  const { handleAutoFixBlocked, isMatching: isAutoFixing } = useAutoFixBlocked(deck, {
    onDeckUpdate: setDeck,
    onViewProblems: deck ? () => navigate(`/deck/${deck.id}?filter=blocked`) : undefined,
  });

  useEffect(() => {
    if (!activeDeck || activeDeck.id !== id) return;
    setDeck((current) => {
      if (!current || current.updatedAt === activeDeck.updatedAt) return current;
      return activeDeck;
    });
  }, [activeDeck, id]);

  useEffect(() => {
    if (!id) return;
    const found = loadDeck(id);
    if (found) {
      setDeck(found);
      setDeckName(found.name);
    } else if (decks.length > 0) {
      navigate(`/deck/${decks[0].id}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [id, loadDeck, decks, navigate]);

  useEffect(() => {
    blockedToastShownRef.current = false;
  }, [id]);

  useEffect(() => {
    setAddSongRainbowDismissed(false);
  }, [id]);

  useEffect(() => {
    if (!deck || blockedToastShownRef.current) return;

    const count = getUnplayableTracks(deck.tracks).length;
    if (count === 0) return;

    blockedToastShownRef.current = true;
    showToast({
      title: `${count} song${count > 1 ? "s" : ""} cannot play audio in the game`,
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      message:
        "Some videos have playback restrictions outside YouTube. Use Auto-Fix to automatically find and replace them with working versions.",
      duration: 12000,
      actions: [
        {
          id: "auto-fix",
          label: "Auto-Fix",
          variant: "primary",
          onClick: () => handleAutoFixBlocked(),
        },
      ],
    });
  }, [deck, showToast, handleAutoFixBlocked]);

  // Silently verify uncached YouTube links when a deck is opened
  useEffect(() => {
    if (!deck || isMatching || isAutoFixing) return;
    if (backgroundVerifyRef.current === deck.id) return;

    const uncached = deck.tracks.filter(
      (t) => t.youtubeVideoId && !getCachedEmbedStatus(t.youtubeVideoId)
    );
    if (uncached.length === 0) {
      backgroundVerifyRef.current = deck.id;
      return;
    }

    let cancelled = false;
    backgroundVerifyRef.current = deck.id;

    void validateTracksEmbeddability(uncached, 3).then(({ invalidTracks }) => {
      if (cancelled || invalidTracks.length === 0) return;

      setDeck((current) => {
        if (!current) return null;
        const invalidIds = new Set(invalidTracks.map((entry) => entry.track.id));
        const nextTracks = current.tracks.map((track) =>
          invalidIds.has(track.id) ? { ...track, matchStatus: "failed" as const } : track
        );
        const nextDeck = { ...current, tracks: nextTracks };
        updateDeck(nextDeck);
        return nextDeck;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.tracks.length, isMatching, isAutoFixing, updateDeck]);

  const handleAutoMatchAll = useCallback(async () => {
    if (!deck) return;

    setIsMatching(true);
    cancelMatchingRef.current = false;

    try {
      const updatedTracks = await batchMatchTracks(
        deck.tracks,
        2,
        (progress, updatedTrack) => {
          setMatchProgress(progress);
          setDeck((current) => {
            if (!current) return null;
            const nextTracks = current.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
            const nextDeck = { ...current, tracks: nextTracks };
            updateDeck(nextDeck);
            return nextDeck;
          });
        },
        () => cancelMatchingRef.current
      );

      setDeck((current) => {
        if (!current) return null;
        const finalDeck = { ...current, tracks: updatedTracks };
        updateDeck(finalDeck);
        return finalDeck;
      });
    } catch (err) {
      console.error("Batch match error:", err);
    } finally {
      setIsMatching(false);
      setMatchProgress(null);
    }
  }, [deck, updateDeck]);

  useEffect(() => {
    if (!deck || !autostartMatch || autostartMatchRef.current) return;
    if (isMatching || isAutoFixing) return;

    const hasPending = deck.tracks.some((track) => track.matchStatus === "pending");
    if (!hasPending) {
      autostartMatchRef.current = true;
      setSearchParams((params) => {
        params.delete("autostart");
        return params;
      }, { replace: true });
      return;
    }

    autostartMatchRef.current = true;
    setSearchParams((params) => {
      params.delete("autostart");
      return params;
    }, { replace: true });
    void handleAutoMatchAll();
  }, [deck, autostartMatch, isMatching, isAutoFixing, setSearchParams, handleAutoMatchAll]);

  if (!deck) {
    return (
      <Window title="Deck Editor">
        <p>Loading deck...</p>
      </Window>
    );
  }

  const handleUpdateTrack = (updated: Track) => {
    const updatedTracks = deck.tracks.map((t) => (t.id === updated.id ? updated : t));
    const newDeck = { ...deck, tracks: updatedTracks };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const handleDeleteTrack = (trackId: string) => {
    const updatedTracks = deck.tracks.filter((t) => t.id !== trackId);
    const newDeck = { ...deck, tracks: updatedTracks };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const handleSaveDeckName = () => {
    if (!deckName.trim()) return;
    const newDeck = { ...deck, name: deckName.trim() };
    setDeck(newDeck);
    updateDeck(newDeck);
    setIsEditingName(false);
  };

  const handleAddTrack = (track: Track) => {
    if (track.youtubeVideoId && deck.tracks.some((t) => t.youtubeVideoId === track.youtubeVideoId)) {
      return;
    }
    const newDeck = { ...deck, tracks: [track, ...deck.tracks] };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const handleAddTracks = (tracks: Track[]) => {
    const seen = new Set(deck.tracks.map((t) => t.youtubeVideoId).filter(Boolean));
    const fresh = tracks.filter((track) => {
      if (!track.youtubeVideoId) return true;
      if (seen.has(track.youtubeVideoId)) return false;
      seen.add(track.youtubeVideoId);
      return true;
    });
    if (fresh.length === 0) return;
    const newDeck = { ...deck, tracks: [...fresh, ...deck.tracks] };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const blockedCount = getUnplayableTracks(deck.tracks).length;
  const playableCount = deck.tracks.length - blockedCount;
  const isTrackBusy = isMatching || isAutoFixing;
  const emptyDeck = isEmptyDeck(deck);
  const showAddSongRainbow = emptyDeck && !addSongRainbowDismissed;
  const hostDisabled = isTrackBusy || hostGateChecking || emptyDeck;

  const handleHostLiveGame = async () => {
    if (!deck) return;

    if (canStartGame(deck.tracks)) {
      navigate(`/deck/${deck.id}/play`);
      return;
    }

    setHostGateOpen(true);
    setHostGateChecking(true);
    setHostGateInvalid([]);
    setHostGateProgress(null);

    try {
      const result = await ensureDeckPlayable(deck.tracks, {
        onProgress: setHostGateProgress,
      });

      if (result.invalidTracks.length > 0) {
        const invalidIds = new Set(result.invalidTracks.map((i) => i.track.id));
        const updatedTracks = deck.tracks.map((track) =>
          invalidIds.has(track.id) ? { ...track, matchStatus: "failed" as const } : track
        );
        const updatedDeck = { ...deck, tracks: updatedTracks };
        setDeck(updatedDeck);
        updateDeck(updatedDeck);
        setHostGateInvalid(result.invalidTracks);
      } else {
        navigate(`/deck/${deck.id}/play`);
        setHostGateOpen(false);
      }
    } catch (err) {
      console.error("Host gate verification error:", err);
    } finally {
      setHostGateChecking(false);
      setHostGateProgress(null);
    }
  };

  const handleOpenAddTrack = () => {
    setAddSongRainbowDismissed(true);
    setShowAddTrackModal(true);
  };

  return (
    <div className="space-y-4">
      {isMobile ? (
        <PageHeader
          back={{ fallbackTo: "/", fallbackLabel: "All decks" }}
          title={deck.name}
          primaryAction={
            <Button
              type="button"
              variant="primary"
              onClick={handleHostLiveGame}
              disabled={hostDisabled}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined}
            >
              <Radio className="w-4 h-4" />
              {hostGateChecking ? "Verifying..." : "Host"}
            </Button>
          }
          overflowItems={[
            {
              icon: <Share2 className="w-4 h-4" />,
              label: "Share",
              onClick: () => shareDeck(deck),
              disabled: emptyDeck,
              title: emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined,
            },
            {
              icon: <Printer className="w-4 h-4" />,
              label: "Bingo Cards",
              onClick: () => navigate(`/deck/${deck.id}/cards`),
              disabled: emptyDeck,
              title: emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined,
            },
          ]}
        />
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
          <BackButton fallbackTo="/" fallbackLabel="All decks" />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => shareDeck(deck)}
              disabled={emptyDeck}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined}
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>
            {emptyDeck ? (
              <span title={EMPTY_DECK_ACTION_TITLE} className="contents">
                <span className="pc-button opacity-60 pointer-events-none" aria-disabled tabIndex={-1}>
                  <Printer className="w-4 h-4" />
                  Bingo Cards
                </span>
              </span>
            ) : (
              <Link to={`/deck/${deck.id}/cards`} className="pc-button">
                <Printer className="w-4 h-4" />
                Bingo Cards
              </Link>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={handleHostLiveGame}
              disabled={hostDisabled}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined}
            >
              <Radio className="w-4 h-4" />
              {hostGateChecking ? "Verifying..." : "Host Live Game"}
            </Button>
          </div>
        </div>
      )}

      <Window title="Deck Properties">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2 max-w-xl">
                <Input
                  type="text"
                  className="w-full"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDeckName();
                    if (e.key === "Escape") {
                      setDeckName(deck.name);
                      setIsEditingName(false);
                    }
                  }}
                />
                <Button type="button" variant="primary" onClick={handleSaveDeckName}>
                  <Check className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold truncate">{deck.name}</h1>
                <button
                  type="button"
                  className="pc-button"
                  onClick={() => setIsEditingName(true)}
                  title="Rename deck"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="mt-2 text-xs flex flex-wrap items-center gap-2">
              <span>{deck.tracks.length} Total Tracks</span>
              <span>·</span>
              <span className={blockedCount > 0 ? "text-pc-warning font-semibold" : "text-green-600 dark:text-green-400 font-semibold"}>
                {playableCount} Ready / {blockedCount} Need Attention
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`pc-rainbow-attention${showAddSongRainbow ? " pc-rainbow-attention--active" : ""}`}
            >
              <Button type="button" variant="primary" onClick={handleOpenAddTrack}>
                <Plus className="w-4 h-4" />
                Add song
              </Button>
            </span>
          </div>
        </div>
      </Window>

      <TrackTable
        deckId={deck.id}
        tracks={deck.tracks}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onAutoMatchAll={handleAutoMatchAll}
        onAutoFixBlocked={handleAutoFixBlocked}
        isMatching={isTrackBusy}
        matchProgress={matchProgress}
        initialStatusFilter={initialStatusFilter}
        onCancelMatching={() => {
          cancelMatchingRef.current = true;
        }}
      />

      {hostGateOpen && (hostGateChecking || hostGateInvalid.length > 0) && (
        <PcModal
          title="Cannot Start Game"
          onClose={() => {
            if (!hostGateChecking) setHostGateOpen(false);
          }}
          className="max-w-lg"
        >
          {hostGateChecking ? (
            <div className="space-y-3 text-xs">
              <p className="font-bold">Checking audio compatibility...</p>
              {hostGateProgress ? (
                <p>
                  {hostGateProgress.completed} / {hostGateProgress.total} songs checked
                  {hostGateProgress.currentTrackTitle ? ` · ${hostGateProgress.currentTrackTitle}` : ""}
                </p>
              ) : (
                <p>Verifying YouTube embed permissions...</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div>
                <p className="font-bold">
                  All songs must be playable before starting the game.
                </p>
                <p className="mt-2">
                  {hostGateInvalid.length} song{hostGateInvalid.length > 1 ? "s" : ""} cannot be played.
                  Use Auto-Fix or fix them manually, then try again.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleAutoFixBlocked}
                  disabled={isTrackBusy}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-Fix Songs
                </Button>
                <Link
                  to={`/deck/${deck.id}?filter=blocked`}
                  className="pc-button"
                  onClick={() => setHostGateOpen(false)}
                >
                  View Problem Songs
                </Link>
                <Button type="button" onClick={() => setHostGateOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </PcModal>
      )}

      {showAddTrackModal && (
        <PcModal
          title="Add a song"
          onClose={() => setShowAddTrackModal(false)}
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          <p className="text-xs mb-3">Find clips by song name or paste a YouTube link — results appear here.</p>
          <SongSearch
            existingVideoIds={deck.tracks.map((t) => t.youtubeVideoId)}
            onAddTrack={handleAddTrack}
            onAddTracks={handleAddTracks}
          />
        </PcModal>
      )}
    </div>
  );
};
