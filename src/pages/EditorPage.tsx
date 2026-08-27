import React, { useEffect, useState, useRef } from "react";
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
import { PcModal } from "../components/ui/PcModal";
import { useToast } from "../state/ToastContext";
import {
  Edit3,
  Printer,
  Radio,
  Download,
  Plus,
  ArrowLeft,
  Check,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { decks, loadDeck, updateDeck, exportDeck } = useDeck();
  const statusFilterParam = searchParams.get("filter");
  const initialStatusFilter =
    statusFilterParam === "blocked" ? "blocked" : "all";

  const [deck, setDeck] = useState<Deck | null>(null);
  const [deckName, setDeckName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<BatchMatchProgress | null>(null);
  const cancelMatchingRef = useRef(false);

  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState<BatchValidationProgress | null>(null);
  const cancelValidationRef = useRef(false);

  const { showToast } = useToast();

  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [hostGateOpen, setHostGateOpen] = useState(false);
  const [hostGateChecking, setHostGateChecking] = useState(false);
  const [hostGateProgress, setHostGateProgress] = useState<BatchValidationProgress | null>(null);
  const [hostGateInvalid, setHostGateInvalid] = useState<InvalidTrackEntry[]>([]);
  const backgroundVerifyRef = useRef<string | null>(null);

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

  // Silently verify uncached YouTube links when a deck is opened
  useEffect(() => {
    if (!deck || isValidating || isMatching) return;
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
  }, [deck?.id, deck?.tracks.length, isValidating, isMatching, updateDeck]);

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

  const handleAutoMatchAll = async () => {
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

      const finalDeck = { ...deck, tracks: updatedTracks };
      setDeck(finalDeck);
      updateDeck(finalDeck);
    } catch (err) {
      console.error("Batch match error:", err);
    } finally {
      setIsMatching(false);
      setMatchProgress(null);
    }
  };

  const handleVerifyAllAudio = async () => {
    setIsValidating(true);
    cancelValidationRef.current = false;

    try {
      const { invalidTracks } = await validateTracksEmbeddability(
        deck.tracks,
        3,
        (prog) => setValidationProgress(prog),
        () => cancelValidationRef.current
      );

      if (invalidTracks.length > 0) {
        const invalidMap = new Map(invalidTracks.map((i) => [i.track.id, i.validation]));
        const updatedTracks = deck.tracks.map((track) => {
          if (invalidMap.has(track.id)) {
            return {
              ...track,
              matchStatus: "failed" as const,
            };
          }
          return track;
        });
        const updatedDeck = { ...deck, tracks: updatedTracks };
        setDeck(updatedDeck);
        updateDeck(updatedDeck);
        showToast({
          title: "Audio Check",
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          message: `Checked ${deck.tracks.length} songs. Found ${invalidTracks.length} song${
            invalidTracks.length > 1 ? "s" : ""
          } with playback restrictions.`,
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
      } else {
        showToast({
          title: "Audio Check",
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
          message: `All ${deck.tracks.length} songs verified! Audio is ready for all tracks.`,
          duration: 8000,
        });
      }
    } catch (err) {
      console.error("Audio verification error:", err);
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  const handleAutoFixBlocked = async () => {
    const blockedTrackIds = new Set(
      getUnplayableTracks(deck.tracks).map((t) => t.id)
    );

    if (blockedTrackIds.size === 0) return;

    // Reset blocked tracks to pending so batchMatchTracks re-evaluates them with fallback
    const preparedTracks = deck.tracks.map((t) => {
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

      const finalDeck = { ...deck, tracks: updatedTracks };
      setDeck(finalDeck);
      updateDeck(finalDeck);

      const recheck = await ensureDeckPlayable(updatedTracks, {
        onProgress: setValidationProgress,
      });
      if (recheck.invalidTracks.length > 0) {
        const invalidIds = new Set(recheck.invalidTracks.map((i) => i.track.id));
        const markedTracks = updatedTracks.map((track) =>
          invalidIds.has(track.id) ? { ...track, matchStatus: "failed" as const } : track
        );
        const markedDeck = { ...finalDeck, tracks: markedTracks };
        setDeck(markedDeck);
        updateDeck(markedDeck);
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
          actions: [
            {
              id: "view-problems",
              label: "View Problems",
              variant: "primary",
              onClick: () => navigate(`/deck/${deck.id}?filter=blocked`),
            },
          ],
        });
      }
    } catch (err) {
      console.error("Auto-fix error:", err);
    } finally {
      setIsMatching(false);
      setMatchProgress(null);
      setValidationProgress(null);
    }
  };

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

  const blockedCount = getUnplayableTracks(deck.tracks).length;
  const playableCount = deck.tracks.length - blockedCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
        <Link to="/" className="pc-button">
          <ArrowLeft className="w-4 h-4" />
          Back to All Decks
        </Link>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => exportDeck(deck)}>
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </Button>
          <Link to={`/deck/${deck.id}/cards`} className="pc-button">
            <Printer className="w-4 h-4" />
            Bingo Cards
          </Link>
          <Button
            type="button"
            variant="primary"
            onClick={handleHostLiveGame}
            disabled={isMatching || isValidating || hostGateChecking}
          >
            <Radio className="w-4 h-4" />
            {hostGateChecking ? "Verifying..." : "Host Live Game"}
          </Button>
        </div>
      </div>

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
                    if (e.key === "Escape") setIsEditingName(false);
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
              <span className={blockedCount > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-green-600 dark:text-green-400 font-semibold"}>
                {playableCount} Ready / {blockedCount} Need Attention
              </span>
              {deck.source?.type === "spotify-playlist" ? <span>· Imported from Spotify</span> : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => setShowAddTrackModal(true)}>
              <Plus className="w-4 h-4" />
              Add song
            </Button>
          </div>
        </div>
      </Window>

      {/* Blocked Songs Warning Banner */}
      {blockedCount > 0 && (
        <div className="p-3 pc-bevel-outset border-l-4 border-amber-500 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-900 dark:text-amber-300">
                {blockedCount} song{blockedCount > 1 ? "s" : ""} cannot play audio in the game
              </p>
              <p className="text-amber-800 dark:text-amber-400 mt-0.5">
                Some videos have playback restrictions outside YouTube. Use Auto-Fix to automatically find and replace them with working versions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="primary"
              onClick={handleAutoFixBlocked}
              disabled={isMatching || isValidating}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isMatching ? "Auto-fixing..." : "Auto-Fix Songs"}</span>
            </Button>
          </div>
        </div>
      )}

      <TrackTable
        tracks={deck.tracks}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onAutoMatchAll={handleAutoMatchAll}
        isMatching={isMatching}
        matchProgress={matchProgress}
        onVerifyAllEmbeds={handleVerifyAllAudio}
        isValidating={isValidating}
        validationProgress={validationProgress}
        initialStatusFilter={initialStatusFilter}
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
              <p className="font-bold">
                All songs must be playable before starting the game.
              </p>
              <p>
                {hostGateInvalid.length} song{hostGateInvalid.length > 1 ? "s" : ""} cannot be played.
                Use Auto-Fix or fix them manually, then try again.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleAutoFixBlocked}
                  disabled={isMatching || isValidating}
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
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <p className="text-xs mb-3">Search by name or paste a YouTube link, then pick the match.</p>
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
