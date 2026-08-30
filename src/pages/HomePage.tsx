import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, TextArea, Window, Modal } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { parseSongList } from "../lib/tracks";
import { SpotifyPlaylistPicker } from "../components/spotify/SpotifyPlaylistPicker";
import { isSpotifyConfigured } from "../lib/spotify/auth";
import { Deck } from "../types/deck";
import { getUnplayableTracks } from "../lib/youtube/validator";
import { canStartGame } from "../lib/youtube/playabilityGate";
import { useToast } from "../state/ToastContext";
import { PcModal } from "../components/ui/PcModal";
import {
  Music,
  Plus,
  Edit3,
  Radio,
  Printer,
  Copy,
  Trash2,
  Share2,
  AlertCircle,
  ListMusic,
} from "lucide-react";

export const HomePage: React.FC = () => {
  const { decks, createDeck, deleteDeck, duplicateDeck, shareDeck } = useDeck();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [showBulkPasteModal, setShowBulkPasteModal] = useState(false);
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [songList, setSongList] = useState("");
  const [deckName, setDeckName] = useState("");
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const handleCreateEmptyDeck = () => {
    const now = new Date().toISOString();
    const saved = createDeck({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: "New Custom Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "manual" },
      tracks: [],
    });
    navigate(`/deck/${saved.id}`);
  };

  const handleSongListImport = (e: React.FormEvent) => {
    e.preventDefault();
    setIngestError(null);

    const { tracks, skipped } = parseSongList(songList);
    if (tracks.length === 0) {
      setIngestError("Add at least one song. Use one line per track, like: Queen - Bohemian Rhapsody");
      return;
    }

    const now = new Date().toISOString();
    const name = deckName.trim() || "Custom Bingo Deck";
    const saved = createDeck({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      createdAt: now,
      updatedAt: now,
      source: { type: "song-list", name: deckName.trim() || "Pasted song list" },
      tracks,
    });

    setShowBulkPasteModal(false);
    setSongList("");
    setDeckName("");
    setIngestError(null);
    navigate(`/deck/${saved.id}`);

    if (skipped > 0) {
      showToast({
        title: "Bulk paste",
        message: `Skipped ${skipped} duplicate or empty song line${skipped === 1 ? "" : "s"}.`,
        duration: 8000,
      });
    }
  };

  const newDeckButton = (
    <button
      type="button"
      className="pc-titlebar-btn"
      onClick={handleCreateEmptyDeck}
      aria-label="New empty deck"
      title="New empty deck"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <Window
      fill
      title="Your bingo decks"
      className="home-decks"
      titleBarProps={{ controls: newDeckButton }}
    >
      <p className="text-sm mb-4">
        Match YouTube clips, print bingo sheets, or launch the host board.
      </p>

      <div className="home-decks-grid">
        <button
          type="button"
          className="home-deck-add"
          onClick={handleCreateEmptyDeck}
        >
          <Plus className="w-7 h-7 shrink-0 opacity-70" aria-hidden />
          <span className="font-semibold text-sm">+ Empty deck</span>
          <span className="text-xs opacity-75">Add songs in the editor</span>
        </button>

        {decks.map((deck) => {
          const matchedCount = deck.tracks.filter(
            (t) => t.matchStatus === "matched" || t.matchStatus === "manual"
          ).length;
          const attentionCount = getUnplayableTracks(deck.tracks).length;
          const playReady = canStartGame(deck.tracks);

          return (
            <Window key={deck.id} title={deck.name} className="home-deck-card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Music className="w-6 h-6 shrink-0" />
                  <p className="text-xs">
                    {deck.tracks.length} tracks · {matchedCount}/{deck.tracks.length} matched
                    {attentionCount > 0 ? (
                      <span className="text-pc-warning font-semibold">
                        {" "}
                        · {attentionCount} need attention
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="pc-button"
                    onClick={() => shareDeck(deck)}
                    title="Share deck"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="pc-button"
                    onClick={() => duplicateDeck(deck.id)}
                    title="Duplicate deck"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="pc-button"
                    onClick={() => setDeckToDelete(deck)}
                    title="Delete deck"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Link to={`/deck/${deck.id}`} className="pc-button">
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </Link>
                <Link to={`/deck/${deck.id}/cards`} className="pc-button">
                  <Printer className="w-3.5 h-3.5" />
                  Cards
                </Link>
                <Link
                  to={playReady ? `/deck/${deck.id}/play` : "#"}
                  className={`pc-button ${playReady ? "pc-button--primary" : "opacity-60 pointer-events-none"}`}
                  aria-disabled={!playReady}
                  title={
                    playReady ? "Host live game" : "Some songs need attention before hosting"
                  }
                  onClick={(e) => {
                    if (!playReady) e.preventDefault();
                  }}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Play
                  {!playReady && attentionCount > 0 ? " ⚠" : ""}
                </Link>
              </div>
            </Window>
          );
        })}
      </div>

      <div className="home-decks-import-links">
        <button
          type="button"
          className="pc-link text-xs bg-transparent border-0 p-0"
          onClick={() => {
            setIngestError(null);
            setShowBulkPasteModal(true);
          }}
        >
          Paste a song list
        </button>
        {isSpotifyConfigured() && (
          <button
            type="button"
            className="pc-link text-xs bg-transparent border-0 p-0 inline-flex items-center gap-1"
            onClick={() => setShowSpotifyModal(true)}
          >
            <ListMusic className="w-3.5 h-3.5" />
            Import from Spotify
          </button>
        )}
      </div>

      {showBulkPasteModal && (
        <PcModal
          title="Create deck from song list"
          onClose={() => {
            setShowBulkPasteModal(false);
            setIngestError(null);
          }}
          className="max-w-lg"
        >
          <form onSubmit={handleSongListImport} className="space-y-3">
            <Input
              type="text"
              className="w-full"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name (e.g. 90s Hits Bingo)"
            />
            <TextArea
              className="w-full"
              value={songList}
              onChange={(e) => {
                setSongList(e.target.value);
                setIngestError(null);
              }}
              rows={8}
              placeholder={"One song per line:\nQueen - Bohemian Rhapsody\nAbba - Dancing Queen"}
            />
            <p className="text-xs">
              Use Artist - Title or Title by Artist. You will match YouTube clips in the editor.
            </p>
            {ingestError && (
              <div className="flex items-center gap-2 text-xs pc-bevel-inset p-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ingestError}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={!songList.trim()}>
                <Plus className="w-4 h-4" />
                Create deck
              </Button>
              <Button type="button" onClick={() => setShowBulkPasteModal(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </PcModal>
      )}

      {showSpotifyModal && (
        <PcModal
          title={
            <span className="inline-flex items-center gap-2">
              <ListMusic className="w-4 h-4" />
              Import from Spotify
            </span>
          }
          onClose={() => setShowSpotifyModal(false)}
          className="max-w-lg max-h-[90vh] overflow-y-auto"
        >
          <SpotifyPlaylistPicker />
        </PcModal>
      )}

      {deckToDelete && (
        <Modal
          open
          variant="danger"
          title="Delete deck"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            deleteDeck(deckToDelete.id);
            setDeckToDelete(null);
          }}
          onCancel={() => setDeckToDelete(null)}
        >
          <p>
            Delete <strong>{deckToDelete.name}</strong> and all {deckToDelete.tracks.length} songs?
            This cannot be undone.
          </p>
        </Modal>
      )}
    </Window>
  );
};
