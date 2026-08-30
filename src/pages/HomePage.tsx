import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Split, TextArea, Window, Modal } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { parseSongList } from "../lib/tracks";
import { getDeckById } from "../lib/storage/decks";
import { SongSearch } from "../components/tracks/SongSearch";
import { SpotifyPlaylistPicker } from "../components/spotify/SpotifyPlaylistPicker";
import { isSpotifyConfigured } from "../lib/spotify/auth";
import { Deck, Track } from "../types/deck";
import { getUnplayableTracks } from "../lib/youtube/validator";
import { canStartGame } from "../lib/youtube/playabilityGate";
import { useToast } from "../state/ToastContext";
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
  const { decks, createDeck, updateDeck, deleteDeck, duplicateDeck, shareDeck } = useDeck();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [songList, setSongList] = useState("");
  const [deckName, setDeckName] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [buildingDeckId, setBuildingDeckId] = useState<string | null>(null);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const buildingDeckIdRef = useRef<string | null>(null);

  useEffect(() => {
    buildingDeckIdRef.current = buildingDeckId;
  }, [buildingDeckId]);

  useEffect(() => {
    if (!buildingDeckId || selectedTracks.length === 0) return;
    const existing = decks.find((d) => d.id === buildingDeckId);
    const name = deckName.trim() || "Custom Bingo Deck";
    if (existing && existing.name !== name) {
      updateDeck({ ...existing, name });
    }
  }, [deckName, buildingDeckId, decks, selectedTracks.length, updateDeck]);

  const saveAndOpen = (deck: Deck) => {
    const saved = createDeck(deck);
    navigate(`/deck/${saved.id}`);
  };

  const persistBuildingDeck = (tracks: Track[]) => {
    const now = new Date().toISOString();
    const name = deckName.trim() || "Custom Bingo Deck";
    const deckId = buildingDeckIdRef.current;

    if (deckId) {
      const existing = getDeckById(deckId) ?? decks.find((d) => d.id === deckId);
      if (existing) {
        updateDeck({ ...existing, name, tracks, updatedAt: now });
        return;
      }
    }

    const newDeck: Deck = {
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      createdAt: now,
      updatedAt: now,
      source: { type: "song-list", name },
      tracks,
    };
    const saved = createDeck(newDeck);
    buildingDeckIdRef.current = saved.id;
    setBuildingDeckId(saved.id);
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
    const deckId = buildingDeckIdRef.current;

    if (deckId) {
      const existing = getDeckById(deckId) ?? decks.find((d) => d.id === deckId);
      if (existing) {
        updateDeck({
          ...existing,
          name,
          tracks,
          updatedAt: now,
          source: { type: "song-list", name: deckName.trim() || "Pasted song list" },
        });
        navigate(`/deck/${existing.id}`);
        if (skipped > 0) {
          showToast({
            title: "Bulk paste",
            message: `Skipped ${skipped} duplicate or empty song line${skipped === 1 ? "" : "s"}.`,
            duration: 8000,
          });
        }
        return;
      }
    }

    saveAndOpen({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      createdAt: now,
      updatedAt: now,
      source: { type: "song-list", name: deckName.trim() || "Pasted song list" },
      tracks,
    });

    if (skipped > 0) {
      showToast({
        title: "Bulk paste",
        message: `Skipped ${skipped} duplicate or empty song line${skipped === 1 ? "" : "s"}.`,
        duration: 8000,
      });
    }
  };

  const addSelectedTrack = (track: Track) => {
    if (selectedTracks.some((t) => t.youtubeVideoId && t.youtubeVideoId === track.youtubeVideoId)) {
      return;
    }
    const next = [...selectedTracks, track];
    setSelectedTracks(next);
    setIngestError(null);
    persistBuildingDeck(next);
  };

  const addSelectedTracks = (tracks: Track[]) => {
    const seen = new Set(selectedTracks.map((t) => t.youtubeVideoId).filter(Boolean));
    const next = [...selectedTracks];
    for (const track of tracks) {
      if (track.youtubeVideoId && seen.has(track.youtubeVideoId)) continue;
      if (track.youtubeVideoId) seen.add(track.youtubeVideoId);
      next.push(track);
    }
    if (next.length === selectedTracks.length) return;
    setSelectedTracks(next);
    setIngestError(null);
    persistBuildingDeck(next);
  };

  const removeSelectedTrack = (trackId: string) => {
    const next = selectedTracks.filter((t) => t.id !== trackId);
    setSelectedTracks(next);
    if (buildingDeckId) {
      const existing = getDeckById(buildingDeckId) ?? decks.find((d) => d.id === buildingDeckId);
      if (existing) {
        updateDeck({ ...existing, tracks: next });
      }
      if (next.length === 0) {
        buildingDeckIdRef.current = null;
        setBuildingDeckId(null);
      }
    }
  };

  const openBuildingDeck = () => {
    if (!buildingDeckId) return;
    navigate(`/deck/${buildingDeckId}`);
  };

  const handleCreateEmptyDeck = () => {
    const now = new Date().toISOString();
    saveAndOpen({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: "New Custom Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "manual" },
      tracks: [],
    });
  };

  return (
    <Split direction="row" className="home-split">
      <Window fill title="Musical Bingo Creator" grow={3}>
        <div className="home-create">
          <div className="home-create-main">
            <p className="text-sm mb-4">
              Search a song name or paste a YouTube link, pick the right video, then print cards and host game night.
            </p>

            <div className="space-y-3">
              <Input
                type="text"
                className="w-full"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="Deck name (e.g. 90s Hits Bingo)"
              />

              <SongSearch
                existingVideoIds={selectedTracks.map((t) => t.youtubeVideoId)}
                onAddTrack={addSelectedTrack}
                onAddTracks={addSelectedTracks}
              />

              {selectedTracks.length > 0 && (
                <div className="pc-bevel-inset p-3 space-y-3">
                  <p className="text-xs font-bold">
                    {selectedTracks.length} song{selectedTracks.length === 1 ? "" : "s"} saved to{" "}
                    {deckName.trim() || "Custom Bingo Deck"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        className="pc-button text-xs"
                        onClick={() => removeSelectedTrack(track.id)}
                        title="Remove from deck"
                      >
                        {track.artist} — {track.title} ×
                      </button>
                    ))}
                  </div>
                  {buildingDeckId && (
                    <Button variant="primary" type="button" onClick={openBuildingDeck}>
                      <Edit3 className="w-4 h-4" />
                      Open deck
                    </Button>
                  )}
                </div>
              )}
            </div>

            {showBulkPaste && (
              <form onSubmit={handleSongListImport} className="mt-4 space-y-3">
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
                  Use Artist - Title or Title by Artist. You will still match YouTube clips in the editor.
                </p>
                <Button type="submit" disabled={!songList.trim()}>
                  <Plus className="w-4 h-4" />
                  Create from list
                </Button>
              </form>
            )}

            {ingestError && (
              <div className="mt-3 flex items-center gap-2 text-xs pc-bevel-inset p-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ingestError}</span>
              </div>
            )}

            {isSpotifyConfigured() && (
              <Window
                title={
                  <span className="inline-flex items-center gap-2">
                    <ListMusic className="w-4 h-4" />
                    Import from Spotify
                  </span>
                }
                className="mt-4"
              >
                <SpotifyPlaylistPicker />
              </Window>
            )}
          </div>

          <div className="home-create-footer">
            <button
              type="button"
              className="pc-link text-xs bg-transparent border-0 p-0"
              onClick={() => setShowBulkPaste((open) => !open)}
            >
              {showBulkPaste ? "Hide bulk paste" : "Or paste a whole song list"}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={handleCreateEmptyDeck}>
                <Plus className="w-4 h-4" />
                Empty deck
              </Button>
            </div>
          </div>
        </div>
      </Window>

      <Window fill title={`Your Musical Decks (${decks.length})`} grow={2}>
        <p className="text-sm mb-4">Match YouTube clips, print bingo sheets, or launch the host board.</p>
        {decks.length === 0 ? (
          <p className="text-xs">No decks yet. Search a song on the left, or create an empty deck.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {decks.map((deck) => {
              const matchedCount = deck.tracks.filter(
                (t) => t.matchStatus === "matched" || t.matchStatus === "manual"
              ).length;
              const attentionCount = getUnplayableTracks(deck.tracks).length;
              const playReady = canStartGame(deck.tracks);

              return (
                <Window key={deck.id} title={deck.name}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music className="w-6 h-6 shrink-0" />
                      <p className="text-xs">
                        {deck.tracks.length} tracks · {matchedCount}/{deck.tracks.length} matched
                        {attentionCount > 0 ? (
                          <span className="text-pc-warning font-semibold">
                            {" "}· {attentionCount} need attention
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" className="pc-button" onClick={() => shareDeck(deck)} title="Share deck">
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button type="button" className="pc-button" onClick={() => duplicateDeck(deck.id)} title="Duplicate deck">
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
                        playReady
                          ? "Host live game"
                          : "Some songs need attention before hosting"
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
        )}
      </Window>

      {deckToDelete && (
        <Modal
          open
          variant="danger"
          title="Delete deck"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            if (deckToDelete.id === buildingDeckId) {
              buildingDeckIdRef.current = null;
              setBuildingDeckId(null);
              setSelectedTracks([]);
            }
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
    </Split>
  );
};
