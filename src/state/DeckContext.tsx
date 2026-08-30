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
import { buildSharedDeckUrl, shareDeckNative } from "../lib/share/deckShare";
import { fetchSharedDeckPayload, isShareApiConfigured, publishSharedDeck } from "../lib/share/sharedDecksApi";
import { isEmptyDeck } from "../lib/decks/discardable";
import { ShareDeckModal } from "../components/decks/ShareDeckModal";

interface ShareDeckTarget {
  deck: Deck;
  shareId?: string;
  shareUrl?: string;
}

interface DeckContextType {
  decks: Deck[];
  activeDeck: Deck | null;
  isLoading: boolean;
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

export const DeckProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [shareTarget, setShareTarget] = useState<ShareDeckTarget | null>(null);

  const refreshDecks = useCallback(() => {
    const loaded = getStoredDecks();
    setDecks(loaded);
    setIsLoading(false);
  }, []);

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
    const imported = importDeckFromData(payload);
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
