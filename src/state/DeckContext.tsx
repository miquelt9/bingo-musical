import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Deck, Track } from "../types/deck";
import {
  getStoredDecks,
  saveDeck as persistDeck,
  deleteDeck as removeDeck,
  duplicateDeck as cloneDeck,
  exportDeckToJson,
  importDeckFromData,
  parseAndImportDeckFile,
} from "../lib/storage/decks";
import { fetchSharedDeckPayload, isShareApiConfigured, publishSharedDeck } from "../lib/share/sharedDecksApi";
import { buildSharedDeckUrl, shareDeckNative } from "../lib/share/deckShare";
import { isEmptyDeck } from "../lib/decks/discardable";
import { ShareDeckModal } from "../components/decks/ShareDeckModal";
import { deezerHitToTrack, isDeezerApiConfigured, resolveDeezerTrack } from "../lib/deezer/api";
import { trackNeedsDeezerPreviewRefresh } from "../lib/deezer/previewUrl";
import { SAMPLE_DEEZER_DECK } from "../lib/storage/mockDeck";

interface ShareDeckTarget {
  deck: Deck;
  shareId?: string;
  shareUrl?: string;
}

export interface BackgroundTaskStatus {
  label: string;
  completed: number;
  total: number;
}

interface DeckContextType {
  decks: Deck[];
  activeDeck: Deck | null;
  isLoading: boolean;
  backgroundTasks: Record<string, BackgroundTaskStatus>;
  setBackgroundTask: (id: string, status: BackgroundTaskStatus | null) => void;
  loadDeck: (id: string) => Deck | null;
  createDeck: (deck: Deck) => Deck;
  updateDeck: (deck: Deck) => Deck;
  updateTrackInDeck: (deckId: string, track: Track) => void;
  deleteDeck: (id: string) => void;
  duplicateDeck: (id: string) => Deck | null;
  exportDeck: (deck: Deck) => void;
  shareDeck: (deck: Deck) => Promise<void>;
  importDeck: (file: File) => Promise<Deck>;
  importSharedDeck: (shareId: string) => Promise<Deck>;
  refreshDecks: () => void;
}

const DeckContext = createContext<DeckContextType | undefined>(undefined);

/** Prevent React Strict Mode from running two overlapping sample hydrations. */
let deezerSampleHydrateInFlight: Promise<void> | null = null;

export const DeckProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [shareTarget, setShareTarget] = useState<ShareDeckTarget | null>(null);
  const [backgroundTasks, setBackgroundTasks] = useState<Record<string, BackgroundTaskStatus>>({});

  const setBackgroundTask = useCallback((id: string, status: BackgroundTaskStatus | null) => {
    setBackgroundTasks((current) => {
      if (status) return { ...current, [id]: status };
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const hydrateDefaultDeezerSample = useCallback(async () => {
    if (deezerSampleHydrateInFlight) {
      await deezerSampleHydrateInFlight;
      return;
    }

    deezerSampleHydrateInFlight = (async () => {
      if (!isDeezerApiConfigured()) return;

      const stored = getStoredDecks();
      const sample = stored.find((deck) => deck.id === SAMPLE_DEEZER_DECK.id);
      if (!sample || sample.provider !== "deezer") return;

      // Restore known sample Deezer IDs when a previous search-based hydrate wiped them.
      const withKnownIds = sample.tracks.map((track, index) => {
        if (track.media?.provider === "deezer" && track.media.id) return track;
        const template = SAMPLE_DEEZER_DECK.tracks[index];
        if (!template?.media || template.media.provider !== "deezer") return track;
        return {
          ...track,
          media: { ...template.media, previewUrl: null as string | null },
          matchStatus: track.matchStatus === "manual" ? track.matchStatus : ("pending" as const),
        };
      });

      const tracksToResolve = withKnownIds.filter(
        (track) =>
          track.media?.provider === "deezer" &&
          Boolean(track.media.id) &&
          (!track.media.previewUrl || trackNeedsDeezerPreviewRefresh(track))
      );
      if (tracksToResolve.length === 0) return;

      const taskId = `deezer-hydration:${sample.id}`;
      setBackgroundTask(taskId, {
        label: "Loading Deezer previews",
        completed: 0,
        total: tracksToResolve.length,
      });

      try {
        // Resolve by known Deezer track ID — do not re-search by title (that can wipe IDs).
        // Commit each result as it arrives so the deck becomes playable progressively
        // instead of showing every track as needing attention until the final request.
        const tracks = [...withKnownIds];
        for (let index = 0; index < tracks.length; index += 1) {
          const track = tracks[index];
          if (track.media?.provider !== "deezer" || !track.media.id) continue;
          if (track.media.previewUrl && !trackNeedsDeezerPreviewRefresh(track)) continue;

          try {
            const hit = await resolveDeezerTrack(track.media.id);
            if (!hit.previewUrl) continue;
            const resolved = deezerHitToTrack(hit);
            tracks[index] = {
              ...track,
              album: resolved.album || track.album,
              albumArtUrl: resolved.albumArtUrl || track.albumArtUrl,
              durationMs: resolved.durationMs || track.durationMs,
              media: resolved.media,
              // Keep the sample clip window when we already had one.
              startTime: track.media.id === hit.id ? track.startTime : resolved.startTime,
              endTime: track.media.id === hit.id ? track.endTime : resolved.endTime,
              matchStatus: "matched" as const,
            };

            const saved = persistDeck({
              ...sample,
              tracks,
              updatedAt: new Date().toISOString(),
            });
            setDecks(getStoredDecks());
            setActiveDeck((current) => (current?.id === saved.id ? saved : current));
          } catch {
            // Keep this track available for manual matching and continue hydrating the rest.
          } finally {
            setBackgroundTask(taskId, {
              label: "Loading Deezer previews",
              completed: tracksToResolve.findIndex((candidate) => candidate.id === track.id) + 1,
              total: tracksToResolve.length,
            });
          }
        }
      } catch {
        // The starter remains available for manual matching when the Worker or Deezer is offline.
      } finally {
        setBackgroundTask(taskId, null);
      }
    })();

    try {
      await deezerSampleHydrateInFlight;
    } finally {
      deezerSampleHydrateInFlight = null;
    }
  }, []);

  const refreshDecks = useCallback(() => {
    const loaded = getStoredDecks();
    setDecks(loaded);
    setIsLoading(false);
    void hydrateDefaultDeezerSample();
  }, [hydrateDefaultDeezerSample]);

  useEffect(() => {
    refreshDecks();
  }, [refreshDecks]);

  const loadDeck = useCallback(
    (id: string): Deck | null => {
      const all = getStoredDecks();
      const match = all.find((d) => d.id === id) || null;
      setActiveDeck(match);
      return match;
    },
    []
  );

  const createDeck = (newDeck: Deck): Deck => {
    const saved = persistDeck(newDeck);
    refreshDecks();
    setActiveDeck(saved);
    return saved;
  };

  const updateDeck = (updated: Deck): Deck => {
    const saved = persistDeck(updated);
    refreshDecks();
    if (activeDeck?.id === updated.id) {
      setActiveDeck(saved);
    }
    return saved;
  };

  const updateTrackInDeck = (deckId: string, updatedTrack: Track) => {
    const all = getStoredDecks();
    const deck = all.find((d) => d.id === deckId);
    if (!deck) return;

    const trackIndex = deck.tracks.findIndex((t) => t.id === updatedTrack.id);
    if (trackIndex === -1) return;

    const newTracks = [...deck.tracks];
    newTracks[trackIndex] = updatedTrack;

    const newDeck: Deck = {
      ...deck,
      tracks: newTracks,
      updatedAt: new Date().toISOString(),
    };

    updateDeck(newDeck);
  };

  const deleteDeck = (id: string) => {
    removeDeck(id);
    refreshDecks();
    if (activeDeck?.id === id) {
      setActiveDeck(null);
    }
  };

  const duplicate = (id: string): Deck | null => {
    const cloned = cloneDeck(id);
    if (cloned) {
      refreshDecks();
    }
    return cloned;
  };

  const exportDeck = (deck: Deck) => {
    exportDeckToJson(deck);
  };

  const shareDeck = async (deck: Deck) => {
    if (isEmptyDeck(deck)) return;

    if (!isShareApiConfigured()) {
      setShareTarget({ deck });
      return;
    }

    try {
      const { shareId } = await publishSharedDeck(deck);
      const shareUrl = buildSharedDeckUrl(shareId);
      const shared = await shareDeckNative(deck, shareUrl);
      if (!shared) {
        setShareTarget({ deck, shareId, shareUrl });
      }
    } catch {
      setShareTarget({ deck });
    }
  };

  const importDeck = async (file: File): Promise<Deck> => {
    const imported = await parseAndImportDeckFile(file);
    refreshDecks();
    setActiveDeck(imported);
    return imported;
  };

  const importSharedDeck = async (shareId: string): Promise<Deck> => {
    const payload = await fetchSharedDeckPayload(shareId);
    let imported = importDeckFromData(payload);
    if (imported.provider === "deezer") {
      const missing = imported.tracks.filter((track) => track.media?.provider === "deezer" && !track.media.previewUrl);
      const resolved = await Promise.all(missing.map(async (track) => {
        try {
          return { sourceId: track.media!.id, hit: await resolveDeezerTrack(track.media!.id) };
        } catch {
          return null;
        }
      }));
      const bySourceId = new Map(resolved.filter((item): item is NonNullable<typeof item> => item !== null).map((item) => [item.sourceId, item.hit]));
      if (bySourceId.size > 0) {
        imported = updateDeck({
          ...imported,
          tracks: imported.tracks.map((track) => {
            const hit = track.media?.provider === "deezer" ? bySourceId.get(track.media.id) : undefined;
            if (!hit) return track;
            const resolvedTrack = deezerHitToTrack(hit);
            return { ...track, album: resolvedTrack.album, albumArtUrl: resolvedTrack.albumArtUrl, durationMs: resolvedTrack.durationMs, media: resolvedTrack.media, startTime: resolvedTrack.startTime, endTime: resolvedTrack.endTime, matchStatus: "matched" as const };
          }),
        });
      }
    }
    refreshDecks();
    setActiveDeck(imported);
    return imported;
  };

  return (
    <DeckContext.Provider
      value={{
        decks,
        activeDeck,
        isLoading,
        loadDeck,
        createDeck,
        updateDeck,
        updateTrackInDeck,
        deleteDeck: deleteDeck,
        duplicateDeck: duplicate,
        exportDeck,
        shareDeck,
        importDeck,
        importSharedDeck,
        refreshDecks,
        backgroundTasks,
        setBackgroundTask,
      }}
    >
      {children}
      {shareTarget ? (
        <ShareDeckModal
          deck={shareTarget.deck}
          initialShareId={shareTarget.shareId}
          initialShareUrl={shareTarget.shareUrl}
          onClose={() => setShareTarget(null)}
        />
      ) : null}
    </DeckContext.Provider>
  );
};

export function useDeck(): DeckContextType {
  const ctx = useContext(DeckContext);
  if (!ctx) {
    throw new Error("useDeck must be used within a DeckProvider");
  }
  return ctx;
}
