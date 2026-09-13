import React, { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button, Input, Window } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { Track, Deck } from "../types/deck";
import { TrackTable } from "../components/tracks/TrackTable";
import { ConvertDeckModal } from "../components/decks/ConvertDeckModal";

import { SongSearch } from "../components/tracks/SongSearch";
import { SuggestSongsModal } from "../components/tracks/SuggestSongsModal";
import { pickSuggestSeeds } from "../lib/music/suggest";
import { batchMatchTracks, BatchMatchProgress } from "../lib/youtube/matcher";
import { batchMatchDeezerTracks } from "../lib/deezer/matcher";
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
import {
  formatReadinessPrimary,
  formatReadinessSecondary,
  getDeckReadiness,
  MIN_CARDS_TRACKS,
} from "../lib/decks/readiness";
import { EMPTY_DECK_ACTION_TITLE, isEmptyDeck } from "../lib/decks/discardable";
import { PcModal } from "../components/ui/PcModal";
import { PageHeader } from "../components/layout/PageHeader";
import { BackButton } from "../components/ui/BackButton";
import { useToast } from "../state/ToastContext";
import { usePlayerUI } from "../state/PlayerUIContext";
import { useAutoFixBlocked } from "../hooks/useAutoFixBlocked";
import { useDeckRoute } from "../hooks/useDeckRoute";
import { useIsMobile } from "../hooks/useMediaQuery";
import { stopPlayback } from "../lib/player/player";
import { DeckNotFoundPage } from "./DeckNotFoundPage";
import { getTrackSourceId } from "../lib/music/providers";
import {
  CollaborativeApiError,
  CollaborativePlaylist,
  fetchCollaborativePlaylist,
  updateCollaborativePlaylist,
} from "../lib/share/collaborativePlaylistsApi";
import { songIdentityKey } from "../lib/music/songIdentity";
import {
  Edit3,
  Printer,
  Radio,
  Share2,
  Users,
  Plus,
  Check,
  AlertTriangle,
  Sparkles,
  ArrowRightLeft,
  Wand2,
  RefreshCw,
} from "lucide-react";

function collaborativeTrackKey(track: Track): string {
  if (track.media) return `media:${track.media.provider}:${track.media.id.toLowerCase()}`;
  return `text:${songIdentityKey(track.artist, track.title)}`;
}

type CollaborativeDeckMutation = (latest: Deck) => Deck;

function mergeCollaborativeTracks(localTracks: Track[], remoteTracks: Track[]): {
  tracks: Track[];
  addedTracks: Track[];
  addedCount: number;
} {
  const addedTracks: Track[] = [];
  const seen = new Set(localTracks.map(collaborativeTrackKey));
  for (const track of remoteTracks) {
    const key = collaborativeTrackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    addedTracks.push(track);
  }
  return { tracks: [...addedTracks, ...localTracks], addedTracks, addedCount: addedTracks.length };
}

export const EditorPage: React.FC = () => {
  const { id, deck: routeDeck, notFound } = useDeckRoute();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeDeck, updateDeck, createDeck, shareDeck, setBackgroundTask, backgroundTasks } = useDeck();
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
  const collaborativeMutationRef = useRef<(mutation: CollaborativeDeckMutation, successMessage?: string) => Promise<boolean>>(() => Promise.resolve(false));
  const collaborativeWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const collaborativeRefreshRef = useRef<string | null>(null);
  const [recentCollaborativeTrackKeys, setRecentCollaborativeTrackKeys] = useState<Set<string>>(new Set());

  const { showToast } = useToast();
  const { requestPlayerEngine, releasePlayerEngine } = usePlayerUI();
  const isMobile = useIsMobile();

  const [showAddTrackModal, setShowAddTrackModal] = useState(false);

  const [isCollaborativeSyncing, setIsCollaborativeSyncing] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [suggestSeeds, setSuggestSeeds] = useState<Track[] | null>(null);
  const [addSongRainbowDismissed, setAddSongRainbowDismissed] = useState(false);
  const [hostGateOpen, setHostGateOpen] = useState(false);
  const [hostGateChecking, setHostGateChecking] = useState(false);
  const [hostGateProgress, setHostGateProgress] = useState<BatchValidationProgress | null>(null);
  const [hostGateInvalid, setHostGateInvalid] = useState<InvalidTrackEntry[]>([]);
  const backgroundVerifyRef = useRef<string | null>(null);
  const autostartMatchRef = useRef(false);
  const blockedToastShownRef = useRef(false);

  const { handleAutoFixBlocked, isMatching: isAutoFixing } = useAutoFixBlocked(deck, {
    onDeckUpdate: (nextDeck) => {
      setDeck(nextDeck);
      if (nextDeck.collaboration) {
        const desiredTracks = new Map(nextDeck.tracks.map((track) => [collaborativeTrackKey(track), track]));
        collaborativeMutationRef.current((latest) => ({
          ...latest,
          tracks: latest.tracks.map((track) => desiredTracks.get(collaborativeTrackKey(track)) ?? track),
        }));
      }
    },
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
    if (!routeDeck) return;
    setDeck(routeDeck);
    setDeckName(routeDeck.name);
  }, [routeDeck]);

  useEffect(() => {
    const deckId = deck?.id;
    const collaborationId = deck?.collaboration?.id;
    if (!deckId || !collaborationId) {
      collaborativeRefreshRef.current = null;
      setRecentCollaborativeTrackKeys(new Set());
      return;
    }

    const refreshKey = `${deckId}:${collaborationId}`;
    if (collaborativeRefreshRef.current === refreshKey) return;
    collaborativeRefreshRef.current = refreshKey;
    setRecentCollaborativeTrackKeys(new Set());

    let cancelled = false;
    setIsCollaborativeSyncing(true);
    void fetchCollaborativePlaylist(collaborationId)
      .then((remote) => {
        if (cancelled) return;
        setDeck((current) => {
          if (!current || current.id !== deckId || current.collaboration?.id !== collaborationId) return current;
          const merged = mergeCollaborativeTracks(current.tracks, remote.tracks);
          const revisionChanged = current.collaboration.revision !== remote.revision;
          if (!revisionChanged && merged.addedCount === 0 && current.name === remote.name && current.provider === remote.provider) {
            return current;
          }
          if (merged.addedTracks.length > 0) {
            setRecentCollaborativeTrackKeys(new Set(merged.addedTracks.map(collaborativeTrackKey)));
          }
          if (!isEditingName) setDeckName(remote.name);
          return updateDeck({
            ...current,
            name: remote.name,
            provider: remote.provider,
            tracks: merged.tracks,
            collaboration: { id: remote.id, revision: remote.revision },
          });
        });
      })
      .catch(() => {
        // Keep the local snapshot available; the manual update button can retry.
      })
      .finally(() => {
        if (!cancelled) setIsCollaborativeSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.collaboration?.id]);

  useEffect(() => {
    blockedToastShownRef.current = false;
  }, [id]);

  useEffect(() => {
    setAddSongRainbowDismissed(false);
  }, [id]);

  useEffect(() => {
    if (!deck || blockedToastShownRef.current) return;

    const isLoadingDeezerPreviews = Boolean(backgroundTasks[`deezer-hydration:${deck.id}`]);
    if (isLoadingDeezerPreviews) return;

    const count = getUnplayableTracks(deck.tracks).length;
    if (count === 0) return;

    blockedToastShownRef.current = true;
    showToast({
      title: `${count} song${count > 1 ? "s" : ""} cannot play audio in the game`,
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      message:
        deck.provider === "deezer"
          ? "Some tracks do not have a usable Deezer preview. Use Fix all songs to search for playable alternatives."
          : "Some videos have playback restrictions outside YouTube. Use Fix all songs to find and replace them with working versions.",
      duration: 12000,
      actions: [
        {
          id: "auto-fix",
          label: "Fix all songs",
          variant: "primary",
          onClick: () => handleAutoFixBlocked(),
        },
      ],
    });
  }, [deck, backgroundTasks, showToast, handleAutoFixBlocked]);

  useEffect(() => {
    if (!deck || statusFilterParam !== "blocked") return;
    if (getUnplayableTracks(deck.tracks).length > 0) return;
    setSearchParams((params) => {
      params.delete("filter");
      return params;
    }, { replace: true });
    showToast({
      title: "All songs are ready to play",
      message: "Every track in this deck can be played during hosting.",
      icon: <Check className="w-3.5 h-3.5" />,
      duration: 5000,
    });
  }, [deck, statusFilterParam, setSearchParams, showToast]);

  // Silently verify uncached YouTube links when a deck is opened
  useEffect(() => {
    if (!deck || isMatching || isAutoFixing) return;
    if (backgroundVerifyRef.current === deck.id) return;

    const uncached = deck.tracks.filter(
      (t) => t.media?.provider === "youtube" && !getCachedEmbedStatus(t.media.id)
    );
    if (uncached.length === 0) {
      backgroundVerifyRef.current = deck.id;
      return;
    }

    let cancelled = false;
    backgroundVerifyRef.current = deck.id;
    const taskId = `youtube-validation:${deck.id}`;
    const taskLabel = "Checking YouTube playback";
    setBackgroundTask(taskId, { label: taskLabel, completed: 0, total: uncached.length });

    void validateTracksEmbeddability(
      uncached,
      3,
      (progress) => {
        if (cancelled) return;
        setBackgroundTask(taskId, {
          label: taskLabel,
          completed: progress.completed,
          total: uncached.length,
        });
      }
    ).then(({ invalidTracks }) => {
      if (cancelled || invalidTracks.length === 0) return;

      setDeck((current) => {
        if (!current) return null;
        const invalidIds = new Set(invalidTracks.map((entry) => entry.track.id));
        const nextTracks = current.tracks.map((track) =>
          invalidIds.has(track.id) ? { ...track, matchStatus: "failed" as const } : track
        );
        const nextDeck = { ...current, tracks: nextTracks };
        if (current.collaboration) {
          const invalidKeys = new Set(invalidTracks.map((entry) => collaborativeTrackKey(entry.track)));
          collaborativeMutationRef.current((latest) => ({
            ...latest,
            tracks: latest.tracks.map((track) =>
              invalidKeys.has(collaborativeTrackKey(track))
                ? { ...track, matchStatus: "failed" as const }
                : track
            ),
          }));
        } else {
          updateDeck(nextDeck);
        }
        return nextDeck;
      });
    }).finally(() => {
      setBackgroundTask(taskId, null);
    });

    return () => {
      cancelled = true;
    };
  }, [deck?.id, deck?.tracks.length, isMatching, isAutoFixing, updateDeck, setBackgroundTask]);

  const handleAutoMatchAll = useCallback(async () => {
    if (!deck) return;

    setIsMatching(true);
    cancelMatchingRef.current = false;
    const taskId = `auto-match:${deck.id}`;
    const taskLabel = `Matching ${deck.provider === "deezer" ? "Deezer" : "YouTube"} songs`;
    setBackgroundTask(taskId, { label: taskLabel, completed: 0, total: deck.tracks.length });

    try {
      const onProgress = (progress: BatchMatchProgress, updatedTrack: Track) => {
        setMatchProgress(progress);
        setBackgroundTask(taskId, {
          label: taskLabel,
          completed: progress.completed,
          total: progress.total,
        });
        setDeck((current) => {
          if (!current) return null;
          const nextTracks = current.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
          const nextDeck = { ...current, tracks: nextTracks };
          if (!current.collaboration) updateDeck(nextDeck);
          return nextDeck;
        });
      };
      const updatedTracks = deck.provider === "deezer"
        ? await batchMatchDeezerTracks(deck.tracks, 2, onProgress, () => cancelMatchingRef.current)
        : await batchMatchTracks(deck.tracks, 2, onProgress, () => cancelMatchingRef.current);

      setDeck((current) => {
        if (!current) return null;
        const finalDeck = { ...current, tracks: updatedTracks };
        if (current.collaboration) {
          const desiredTracks = new Map(updatedTracks.map((track) => [collaborativeTrackKey(track), track]));
          collaborativeMutationRef.current((latest) => ({
            ...latest,
            tracks: latest.tracks.map((track) => desiredTracks.get(collaborativeTrackKey(track)) ?? track),
          }), "Matched songs were synced to the collaborative playlist.");
        } else {
          updateDeck(finalDeck);
        }
        return finalDeck;
      });
    } catch (err) {
      console.error("Batch match error:", err);
    } finally {
      setIsMatching(false);
      setMatchProgress(null);
      setBackgroundTask(taskId, null);
    }
  }, [deck, updateDeck, setBackgroundTask]);

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

  if (notFound) {
    return <DeckNotFoundPage />;
  }

  if (!deck) {
    return (
      <Window title="Deck">
        <p>Loading deck...</p>
      </Window>
    );
  }

  const handleCollaborationLinked = (collaborationId: string, revision = 0) => {
    setDeck((current) => {
      if (!current) return current;
      const currentRevision = current.collaboration?.revision ?? -1;
      if (current.collaboration?.id === collaborationId && currentRevision >= revision) return current;
      const nextDeck = {
        ...current,
        collaboration: { id: collaborationId, revision: Math.max(currentRevision, revision) },
      };
      const saved = updateDeck(nextDeck);
      return saved;
    });
  };

  const mergeRemoteCollaboration = (currentDeck: Deck, remote: CollaborativePlaylist): {
    deck: Deck;
    addedCount: number;
  } => {
    const merged = mergeCollaborativeTracks(currentDeck.tracks, remote.tracks);
    const revisionChanged = currentDeck.collaboration?.id !== remote.id
      || (currentDeck.collaboration?.revision ?? -1) !== remote.revision;
    if (!revisionChanged && merged.addedCount === 0) {
      return { deck: currentDeck, addedCount: 0 };
    }
    if (merged.addedTracks.length > 0) {
      setRecentCollaborativeTrackKeys(new Set(merged.addedTracks.map(collaborativeTrackKey)));
    }
    const saved = updateDeck({
      ...currentDeck,
      name: remote.name,
      provider: remote.provider,
      tracks: merged.tracks,
      collaboration: { id: remote.id, revision: remote.revision },
    });
    setDeckName(remote.name);
    setDeck(saved);
    return { deck: saved, addedCount: merged.addedCount };
  };

  const publishCollaborativeMutation = (mutation: CollaborativeDeckMutation, successMessage?: string): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      if (!deck?.collaboration) return true;
      setIsCollaborativeSyncing(true);
      try {
        let remote = await fetchCollaborativePlaylist(deck.collaboration.id);
        let latest: Deck = {
          ...deck,
          name: remote.name,
          provider: remote.provider,
          tracks: remote.tracks,
          collaboration: { id: remote.id, revision: remote.revision },
        };
        let next = mutation(latest);
        let response;
        try {
          response = await updateCollaborativePlaylist(remote.id, remote.revision, {
            name: next.name,
            provider: next.provider,
            tracks: next.tracks,
          });
        } catch (err) {
          if (!(err instanceof CollaborativeApiError) || err.status !== 409) throw err;
          remote = await fetchCollaborativePlaylist(deck.collaboration.id);
          latest = {
            ...latest,
            name: remote.name,
            provider: remote.provider,
            tracks: remote.tracks,
            collaboration: { id: remote.id, revision: remote.revision },
          };
          next = mutation(latest);
          response = await updateCollaborativePlaylist(remote.id, remote.revision, {
            name: next.name,
            provider: next.provider,
            tracks: next.tracks,
          });
        }

        const saved = updateDeck({
          ...next,
          name: response.playlist.name,
          provider: response.playlist.provider,
          tracks: response.playlist.tracks,
          collaboration: { id: response.playlist.id, revision: response.playlist.revision },
        });
        setDeck(saved);
        if (successMessage) showToast({ title: "Collaborative playlist updated", message: successMessage, duration: 3500 });
        return true;
      } catch (err) {
        showToast({
          title: "Could not sync collaborative playlist",
          message: (err as Error).message || "The local change was not published. Try again.",
          duration: 6000,
        });
        return false;
      } finally {
        setIsCollaborativeSyncing(false);
      }
    };

    const queued = collaborativeWriteQueueRef.current.then(run, run);
    collaborativeWriteQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  };

  collaborativeMutationRef.current = publishCollaborativeMutation;

  const handleRefreshCollaborative = async () => {
    if (!deck?.collaboration) return;
    setIsCollaborativeSyncing(true);
    try {
      const remote = await fetchCollaborativePlaylist(deck.collaboration.id);
      const result = mergeRemoteCollaboration(deck, remote);
      showToast({
        title: result.addedCount > 0 ? "Playlist updated" : "Playlist up to date",
        message: result.addedCount > 0
          ? `${result.addedCount} new song${result.addedCount === 1 ? "" : "s"} added.`
          : "No new songs were found.",
        duration: 4000,
      });
    } catch (err) {
      showToast({ title: "Could not fetch updates", message: (err as Error).message || "Your current deck is unchanged. Try again later.", duration: 6000 });
    } finally {
      setIsCollaborativeSyncing(false);
    }
  };

  const handleUpdateTrack = (updated: Track) => {
    if (deck.collaboration) {
      const original = deck.tracks.find((track) => track.id === updated.id);
      const originalKey = original ? collaborativeTrackKey(original) : updated.id;
      return collaborativeMutationRef.current((latest) => ({
        ...latest,
        tracks: latest.tracks.map((track) =>
          track.id === updated.id || collaborativeTrackKey(track) === originalKey ? updated : track
        ),
      }), `${updated.title} was synced to the collaborative playlist.`);
    }
    const updatedTracks = deck.tracks.map((t) => (t.id === updated.id ? updated : t));
    const newDeck = { ...deck, tracks: updatedTracks };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const handleDeleteTrack = (trackId: string) => {
    if (deck.collaboration) {
      const deleted = deck.tracks.find((track) => track.id === trackId);
      const deletedKey = deleted ? collaborativeTrackKey(deleted) : trackId;
      return collaborativeMutationRef.current((latest) => ({
        ...latest,
        tracks: latest.tracks.filter((track) => track.id !== trackId && collaborativeTrackKey(track) !== deletedKey),
      }), "The song was removed from the collaborative playlist.");
    }
    const updatedTracks = deck.tracks.filter((t) => t.id !== trackId);
    const newDeck = { ...deck, tracks: updatedTracks };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const handleSaveDeckName = () => {
    if (!deckName.trim()) return;
    if (deck.collaboration) {
      const nextName = deckName.trim();
      const result = collaborativeMutationRef.current((latest) => ({ ...latest, name: nextName }), "The playlist name was synced.");
      setIsEditingName(false);
      return result;
    }
    const newDeck = { ...deck, name: deckName.trim() };
    setDeck(newDeck);
    updateDeck(newDeck);
    setIsEditingName(false);
  };


  const handleAddTrack = (track: Track) => {
    if (deck.collaboration) {
      return collaborativeMutationRef.current(
        (latest) => {
          const key = collaborativeTrackKey(track);
          if (latest.tracks.some((existing) => collaborativeTrackKey(existing) === key)) return latest;
          return { ...latest, tracks: [track, ...latest.tracks] };
        },
        `${track.title} was added to the collaborative playlist.`,
      );
    }
    const sourceId = getTrackSourceId(track);
    const duplicate = deck.tracks.some((existing) => {
      const sameSource = sourceId && getTrackSourceId(existing) === sourceId;
      const sameMetadata = existing.artist.trim().toLowerCase() === track.artist.trim().toLowerCase()
        && existing.title.trim().toLowerCase() === track.title.trim().toLowerCase();
      return Boolean(sameSource || sameMetadata);
    });
    if (duplicate) {
      return;
    }
    const newDeck = { ...deck, tracks: [track, ...deck.tracks] };
    setDeck(newDeck);
    updateDeck(newDeck);
    showToast({
      title: `Added ${track.title}`,
      message: `${track.artist} is now in your deck.`,
      duration: 4000,
    });
  };

  const handleAddTracks = (tracks: Track[]) => {
    if (deck.collaboration) {
      return collaborativeMutationRef.current(
        (latest) => {
          const seen = new Set(latest.tracks.map(collaborativeTrackKey));
          const fresh = tracks.filter((track) => {
            const key = collaborativeTrackKey(track);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return fresh.length > 0 ? { ...latest, tracks: [...fresh, ...latest.tracks] } : latest;
        },
        `${tracks.length} song${tracks.length === 1 ? "" : "s"} synced to the collaborative playlist.`,
      );
    }
    const seen = new Set(deck.tracks.map((t) => getTrackSourceId(t)).filter((id): id is string => Boolean(id)));
    const metadata = new Set(deck.tracks.map((t) => `${t.artist.trim().toLowerCase()}\u0000${t.title.trim().toLowerCase()}`));
    const fresh = tracks.filter((track) => {
      const sourceId = getTrackSourceId(track);
      const key = `${track.artist.trim().toLowerCase()}\u0000${track.title.trim().toLowerCase()}`;
      if (sourceId && seen.has(sourceId)) return false;
      if (metadata.has(key)) return false;
      if (sourceId) seen.add(sourceId);
      metadata.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    const newDeck = { ...deck, tracks: [...fresh, ...deck.tracks] };
    setDeck(newDeck);
    updateDeck(newDeck);
  };

  const readiness = getDeckReadiness(deck.tracks);
  const deezerHydration = backgroundTasks[`deezer-hydration:${deck.id}`];
  const isLoadingDeezerPreviews = Boolean(deezerHydration);
  const isTrackBusy = isMatching || isAutoFixing;
  const emptyDeck = isEmptyDeck(deck);
  const showAddSongRainbow = emptyDeck && !addSongRainbowDismissed;
  const hostDisabled = isTrackBusy || hostGateChecking || emptyDeck || !readiness.canHost;

  const handleOpenSuggestSongs = () => {
    if (emptyDeck) return;
    stopPlayback();
    setSuggestSeeds(pickSuggestSeeds(deck.tracks));
  };

  const handleFindSimilar = (track: Track) => {
    stopPlayback();
    setSuggestSeeds([track]);
  };

  const handleHostLiveGame = async () => {
    if (!deck) return;

    if (readiness.canHost && canStartGame(deck.tracks)) {
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
        if (deck.collaboration) {
          const invalidKeys = new Set(result.invalidTracks.map((entry) => collaborativeTrackKey(entry.track)));
          collaborativeMutationRef.current((latest) => ({
            ...latest,
            tracks: latest.tracks.map((track) =>
              invalidKeys.has(collaborativeTrackKey(track))
                ? { ...track, matchStatus: "failed" as const }
                : track
            ),
          }));
        } else {
          updateDeck(updatedDeck);
        }
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
    stopPlayback();
    if (deck) requestPlayerEngine(deck.provider);
    setShowAddTrackModal(true);
  };

  const handleCloseAddTrack = () => {
    stopPlayback();
    releasePlayerEngine();
    setShowAddTrackModal(false);
  };

  return (
    <div className="space-y-4">
      {isMobile ? (
        <PageHeader
          back={{ fallbackTo: "/", fallbackLabel: "All decks" }}
          title={deck.name}
          primaryAction={
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => void shareDeck(deck, handleCollaborationLinked)}
                disabled={emptyDeck}
                title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : "Share"}
                aria-label="Share"
              >
                <Share2 className="w-4 h-4" />
              </Button>

              {deck.collaboration && (
                <>
                  <span className="pc-button opacity-80" title="This deck is collaborative" aria-label="Collaborative playlist">
                    <Users className="w-4 h-4" />
                  </span>
                  <Button
                    type="button"
                    onClick={() => void handleRefreshCollaborative()}
                    disabled={isCollaborativeSyncing}
                    title="Check for collaborative updates"
                    aria-label="Check for collaborative updates"
                  >
                    <RefreshCw className={`w-4 h-4 ${isCollaborativeSyncing ? "animate-spin" : ""}`} />
                  </Button>
                </>
              )}
              {emptyDeck || deck.tracks.length < MIN_CARDS_TRACKS ? (
                <span
                  title={
                    emptyDeck
                      ? EMPTY_DECK_ACTION_TITLE
                      : `Need at least ${MIN_CARDS_TRACKS} songs for bingo cards`
                  }
                  className="contents"
                >
                  <span
                    className="pc-button opacity-60 pointer-events-none"
                    aria-disabled
                    aria-label="Cards"
                    tabIndex={-1}
                  >
                    <Printer className="w-4 h-4" />
                  </span>
                </span>
              ) : (
                <Link
                  to={`/deck/${deck.id}/cards`}
                  className="pc-button"
                    aria-label="Cards"
                    title="Cards"
                >
                  <Printer className="w-4 h-4" />
                </Link>
              )}
              <Button
                type="button"
                variant="primary"
                onClick={handleHostLiveGame}
                disabled={hostDisabled}
                title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : "Host"}
                aria-label={hostGateChecking ? "Verifying deck…" : "Host"}
              >
                <Radio className="w-4 h-4" />
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
          <BackButton fallbackTo="/" fallbackLabel="All decks" />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void shareDeck(deck, handleCollaborationLinked)}
              disabled={emptyDeck}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : undefined}
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </Button>

            {deck.collaboration && (
              <>
                <span className="pc-button opacity-80" title="This deck is collaborative">
                  <Users className="w-3.5 h-3.5" />
                  Collaborative
                </span>
                <Button
                  type="button"
                  onClick={() => void handleRefreshCollaborative()}
                  disabled={isCollaborativeSyncing}
                  title="Check for collaborative updates"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCollaborativeSyncing ? "animate-spin" : ""}`} />
                  {isCollaborativeSyncing ? "Checking…" : "Check for updates"}
                </Button>
              </>
            )}
            {emptyDeck || deck.tracks.length < MIN_CARDS_TRACKS ? (
              <span
                title={
                  emptyDeck
                    ? EMPTY_DECK_ACTION_TITLE
                    : `Need at least ${MIN_CARDS_TRACKS} songs for bingo cards`
                }
                className="contents"
              >
                <span className="pc-button opacity-60 pointer-events-none" aria-disabled tabIndex={-1}>
                  <Printer className="w-4 h-4" />
                  Cards
                </span>
              </span>
            ) : (
              <Link to={`/deck/${deck.id}/cards`} className="pc-button">
                <Printer className="w-4 h-4" />
                Cards
              </Link>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={handleHostLiveGame}
              disabled={hostDisabled}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : readiness.tooFewForHost ? `Need ${readiness.minHostTracks}+ playable songs` : undefined}
            >
              <Radio className="w-4 h-4" />
              {hostGateChecking ? "Verifying..." : "Host"}
            </Button>
          </div>
        </div>
      )}

      <Window title={isMobile ? "Deck" : "Deck Properties"}>
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
              !isMobile && (
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
              )
            )}
            <p className="mt-2 text-xs flex flex-wrap items-center gap-2">
              <span>
                {isLoadingDeezerPreviews
                  ? `Loading Deezer previews… (${deezerHydration.completed}/${deezerHydration.total})`
                  : formatReadinessPrimary(readiness)}
              </span>
              {!isLoadingDeezerPreviews && formatReadinessSecondary(readiness) ? (
                <>
                  <span>·</span>
                  <span className="text-pc-warning font-semibold">{formatReadinessSecondary(readiness)}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => { stopPlayback(); setShowConvertModal(true); }} disabled={emptyDeck} title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : "Create a copy using the other music provider"}>
              <ArrowRightLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Convert deck</span>
            </Button>
            <Button
              type="button"
              onClick={handleOpenSuggestSongs}
              disabled={emptyDeck}
              title={emptyDeck ? EMPTY_DECK_ACTION_TITLE : "Suggest songs based on this deck"}
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Suggest songs</span>
            </Button>
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
        provider={deck.provider}
        tracks={deck.tracks}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onFindSimilar={handleFindSimilar}
        onAutoMatchAll={handleAutoMatchAll}
        isMatching={isTrackBusy}
        matchProgress={matchProgress}
        initialStatusFilter={initialStatusFilter}
        isLoadingDeezerPreviews={isLoadingDeezerPreviews}
        isRecentlyAdded={deck.collaboration ? (track) => recentCollaborativeTrackKeys.has(collaborativeTrackKey(track)) : undefined}
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
                  Use Fix all songs or fix them manually, then try again.
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
                  Fix all songs
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
          title={`Add a song (${deck.tracks.length} in deck)`}
          onClose={handleCloseAddTrack}
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
        <p className="text-xs mb-3">
          {deck.provider === "deezer"
            ? "Search Deezer tracks or paste a track URL. Only tracks with a short preview can be added."
            : "Find clips by song name or paste a YouTube link — results appear here."}
        </p>
          <SongSearch
            provider={deck.provider}
            existingVideoIds={deck.tracks.map((t) => getTrackSourceId(t))}
            onAddTrack={handleAddTrack}
            onAddTracks={handleAddTracks}
          />
        </PcModal>
      )}

      {suggestSeeds && suggestSeeds.length > 0 && (
        <SuggestSongsModal
          provider={deck.provider}
          seeds={suggestSeeds}
          existingIds={deck.tracks.map((t) => getTrackSourceId(t))}
          existingTracks={deck.tracks}
          title={
            suggestSeeds.length === 1
              ? `More songs like ${suggestSeeds[0].artist}`
              : "Suggested songs"
          }
          onClose={() => setSuggestSeeds(null)}
          onAddTrack={handleAddTrack}
          onAddTracks={handleAddTracks}
        />
      )}



      <ConvertDeckModal
        deck={deck}
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        onCreate={(converted) => {
          const saved = createDeck(converted);
          navigate(`/deck/${saved.id}`);
        }}
      />
    </div>
  );
};
