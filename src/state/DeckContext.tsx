import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Deck, Track } from "../types/deck";
import {
  getStoredDecks,
  saveDeck as persistDeck,
  deleteDeck as removeDeck,
  duplicateDeck as cloneDeck,
  exportDeckToJson,
  importDeckFromData,
  parseAndImportDeckFile,
  validateDeckSchema,
} from "../lib/storage/decks";
import { fetchSharedDeckPayload } from "../lib/share/sharedDecksApi";
import { buildCanonicalSharePayload, canonicalPayloadsEqual } from "../lib/share/deckCanonical";
import { isEmptyDeck } from "../lib/decks/discardable";
import { ShareDeckModal } from "../components/decks/ShareDeckModal";
import { deezerHitToTrack, isDeezerApiConfigured, resolveDeezerTrack, searchDeezerTracksBatch } from "../lib/deezer/api";
import { trackNeedsDeezerPreviewRefresh } from "../lib/deezer/previewUrl";
import { SAMPLE_DEEZER_DECK } from "../lib/storage/mockDeck";
import { useToast } from "./ToastContext";
import { AlertCircle, Check } from "lucide-react";

interface ShareDeckTarget {
  deck: Deck;
  shareId?: string;
  shareUrl?: string;
  onLinked?: (collaborationId: string, revision?: number) => void;
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
  shareDeck: (deck: Deck, onLinked?: (collaborationId: string, revision?: number) => void) => Promise<void>;
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
  const importedDeezerHydrationInFlight = useRef(new Map<string, Promise<void>>());
  const { showToast } = useToast();

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
    // A recipient may be opening the app directly from a shared link. Let the
    // imported deck use the Deezer request budget before hydrating the starter.
    if (!window.location.hash.startsWith("#/share/")) {
      void hydrateDefaultDeezerSample();
    }
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
    try {
      exportDeckToJson(deck);
      showToast({
        title: "Deck exported",
        icon: <Check className="w-3.5 h-3.5" />,
        message: `"${deck.name}" was downloaded as a JSON file.`,
        duration: 5000,
      });
    } catch (err) {
      showToast({
        title: "JSON export failed",
        icon: <AlertCircle className="w-3.5 h-3.5" />,
        message: err instanceof Error ? err.message : "Could not download the deck as JSON.",
        duration: 10000,
      });
    }
  };

  const shareDeck = async (deck: Deck, onLinked?: (collaborationId: string, revision?: number) => void) => {
    if (isEmptyDeck(deck)) return;
    setShareTarget({ deck, onLinked });
  };

  const importDeck = async (file: File): Promise<Deck> => {
    const imported = await parseAndImportDeckFile(file);
    refreshDecks();
    setActiveDeck(imported);
    return imported;
  };

  /**
   * Shared exports keep Deezer IDs but omit short-lived preview URLs. Start
   * resolving those IDs after the snapshot has been persisted and opened so a
   * first-time recipient gets to the editor immediately. The editor shows the
   * background task and keeps Host disabled until the previews are usable.
   */
  const hydrateImportedDeezerDeck = (deck: Deck): Promise<void> => {
    if (deck.provider !== "deezer" || !isDeezerApiConfigured()) return Promise.resolve();

    const tracksToHydrate = deck.tracks.filter((track) => (
      track.media?.provider === "deezer"
      && (trackNeedsDeezerPreviewRefresh(track) || !track.albumArtUrl)
    ));
    if (tracksToHydrate.length === 0) return Promise.resolve();

    const existingTask = importedDeezerHydrationInFlight.current.get(deck.id);
    if (existingTask) return existingTask;

    const taskId = `deezer-hydration:${deck.id}`;
    const task = (async () => {
      setBackgroundTask(taskId, {
        label: "Loading Deezer previews",
        completed: 0,
        total: tracksToHydrate.length,
      });

      try {
        const batches = await searchDeezerTracksBatch(tracksToHydrate);
        const hitsById = new Map(
          batches.flat().map((hit) => [hit.id, hit])
        );
        const completed = tracksToHydrate.filter((track) => (
          track.media?.provider === "deezer" && hitsById.has(track.media.id)
        )).length;
        setBackgroundTask(taskId, {
          label: "Loading Deezer previews",
          completed,
          total: tracksToHydrate.length,
        });
        if (hitsById.size === 0) return;

        // Merge into the latest saved deck so edits made while hydration runs
        // (renames, clip changes, added or deleted tracks) are preserved.
        const latest = getStoredDecks().find((stored) => stored.id === deck.id);
        if (!latest || latest.provider !== "deezer") return;

        const tracks = latest.tracks.map((track) => {
          const media = track.media?.provider === "deezer" ? track.media : null;
          const hit = media ? hitsById.get(media.id) : undefined;
          if (!hit) return track;

          const resolved = deezerHitToTrack(hit);
          const previewDurationSec = Math.max(1, (resolved.media?.provider === "deezer"
            ? resolved.media.previewDurationMs ?? 30000
            : 30000) / 1000);
          const startTime = Math.max(0, Math.min(track.startTime, Math.max(0, previewDurationSec - 1)));
          const endTime = Math.min(
            Math.max(startTime + 1, track.endTime),
            previewDurationSec,
          );

          return {
            ...track,
            album: resolved.album || track.album,
            albumArtUrl: resolved.albumArtUrl || track.albumArtUrl,
            durationMs: resolved.durationMs || track.durationMs,
            media: resolved.media,
            startTime,
            endTime,
            // A known Deezer ID is matched even if Deezer has no preview for it.
            matchStatus: "matched" as const,
          };
        });

        const saved = persistDeck({ ...latest, tracks });
        setDecks(getStoredDecks());
        setActiveDeck((current) => (current?.id === saved.id ? saved : current));
      } catch {
        // Do not make a shared deck impossible to import when Deezer is offline.
        // The existing stable IDs remain available for a later Preview refresh.
      } finally {
        setBackgroundTask(taskId, null);
      }
    })();

    importedDeezerHydrationInFlight.current.set(deck.id, task);
    void task.then(
      () => {
        if (importedDeezerHydrationInFlight.current.get(deck.id) === task) {
          importedDeezerHydrationInFlight.current.delete(deck.id);
        }
      },
      () => {
        if (importedDeezerHydrationInFlight.current.get(deck.id) === task) {
          importedDeezerHydrationInFlight.current.delete(deck.id);
        }
      },
    );
    return task;
  };

  const importSharedDeck = async (shareId: string): Promise<Deck> => {
    const payload = await fetchSharedDeckPayload(shareId);
    const candidate = validateDeckSchema(payload);
    if (!candidate.isValid || !candidate.deck) {
      throw new Error(candidate.error || "Invalid shared deck schema.");
    }
    const canonicalPayload = buildCanonicalSharePayload(candidate.deck);
    const existing = getStoredDecks().find((deck) => (
      canonicalPayloadsEqual(buildCanonicalSharePayload(deck), canonicalPayload)
    ));

    const imported = existing ?? importDeckFromData(payload);
    refreshDecks();
    setActiveDeck(imported);
    void hydrateImportedDeezerDeck(imported);
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
          onLinked={shareTarget.onLinked}
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
