import React, { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { parseSongList } from "../lib/tracks";
import { SongSearch } from "../components/tracks/SongSearch";
import { Deck, Track } from "../types/deck";
import {
  Music,
  Plus,
  Upload,
  Sparkles,
  Edit3,
  Radio,
  Printer,
  Download,
  Copy,
  Trash2,
  AlertCircle,
} from "lucide-react";

export const HomePage: React.FC = () => {
  const { decks, createDeck, deleteDeck, duplicateDeck, exportDeck, importDeck } = useDeck();
  const navigate = useNavigate();

  const [songList, setSongList] = useState("");
  const [deckName, setDeckName] = useState("");
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveAndOpen = (deck: Deck) => {
    const saved = createDeck(deck);
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
    saveAndOpen({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: deckName.trim() || "Custom Bingo Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "song-list", name: deckName.trim() || "Pasted song list" },
      tracks,
    });

    if (skipped > 0) {
      console.info(`Skipped ${skipped} duplicate or empty song lines.`);
    }
  };

  const addSelectedTrack = (track: Track) => {
    setSelectedTracks((current) => {
      if (current.some((t) => t.youtubeVideoId && t.youtubeVideoId === track.youtubeVideoId)) {
        return current;
      }
      return [...current, track];
    });
  };

  const addSelectedTracks = (tracks: Track[]) => {
    setSelectedTracks((current) => {
      const seen = new Set(current.map((t) => t.youtubeVideoId).filter(Boolean));
      const next = [...current];
      for (const track of tracks) {
        if (track.youtubeVideoId && seen.has(track.youtubeVideoId)) continue;
        if (track.youtubeVideoId) seen.add(track.youtubeVideoId);
        next.push(track);
      }
      return next;
    });
  };

  const handleCreateFromSearch = () => {
    if (selectedTracks.length === 0) {
      setIngestError("Add at least one song from search results first.");
      return;
    }
    const now = new Date().toISOString();
    saveAndOpen({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: deckName.trim() || "Custom Bingo Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "song-list", name: deckName.trim() || "Searched songs" },
      tracks: selectedTracks,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importDeck(file);
      navigate(`/deck/${imported.id}`);
    } catch (err) {
      alert("JSON import error: " + (err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 p-8 sm:p-12 shadow-2xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>No Spotify account required</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Musical Bingo Creator
          </h1>
          <p className="mt-3 text-base sm:text-lg text-zinc-400">
            Search a song name or paste a YouTube link, pick the right video, then print cards and host game night.
          </p>

          <div className="mt-8 space-y-4">
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name (e.g. 90s Hits Bingo)"
              className="w-full px-5 py-3 rounded-2xl bg-zinc-950/80 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder-zinc-500 outline-none"
            />

            <SongSearch
              existingVideoIds={selectedTracks.map((t) => t.youtubeVideoId)}
              onAddTrack={addSelectedTrack}
              onAddTracks={addSelectedTracks}
            />

            {selectedTracks.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {selectedTracks.length} song{selectedTracks.length === 1 ? "" : "s"} in this deck
                    {selectedTracks.length < 24 ? (
                      <span className="ml-2 text-xs font-medium text-amber-400">
                        {24 - selectedTracks.length} more for a full 5x5 card
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-medium text-emerald-400">Ready for bingo cards</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedTracks([])}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() =>
                        setSelectedTracks((current) => current.filter((t) => t.id !== track.id))
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-200 hover:bg-zinc-700"
                      title="Remove from deck"
                    >
                      <span className="truncate max-w-[14rem]">
                        {track.artist} — {track.title}
                      </span>
                      <span className="text-zinc-500">×</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreateFromSearch}
                  className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-xl shadow-emerald-500/20 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  Create deck
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowBulkPaste((open) => !open)}
            className="mt-6 text-xs font-semibold text-zinc-400 hover:text-white"
          >
            {showBulkPaste ? "Hide bulk paste" : "Or paste a whole song list"}
          </button>

          {showBulkPaste && (
            <form onSubmit={handleSongListImport} className="mt-4 space-y-4">
              <textarea
                value={songList}
                onChange={(e) => {
                  setSongList(e.target.value);
                  setIngestError(null);
                }}
                rows={8}
                placeholder={"One song per line:\nQueen - Bohemian Rhapsody\nAbba - Dancing Queen\nBillie Jean by Michael Jackson"}
                className="w-full px-5 py-4 rounded-2xl bg-zinc-950/80 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder-zinc-500 outline-none font-mono leading-relaxed resize-y"
              />
              <p className="text-xs text-zinc-500">
                Use <span className="text-zinc-300 font-medium">Artist - Title</span> or{" "}
                <span className="text-zinc-300 font-medium">Title by Artist</span>. You will still match YouTube clips in the editor.
              </p>
              <button
                type="submit"
                disabled={!songList.trim()}
                className="px-6 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold text-sm border border-zinc-700 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Create from list
              </button>
            </form>
          )}

          {ingestError && (
            <div className="mt-4 flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-3 rounded-xl border border-red-500/30">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{ingestError}</span>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-zinc-800/80 flex flex-wrap items-center gap-4 text-xs">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
            >
              <Upload className="w-4 h-4 text-blue-400" />
              Import JSON deck
            </button>
            <button
              type="button"
              onClick={handleCreateEmptyDeck}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4 text-zinc-400" />
              Empty deck
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Your Musical Decks</h2>
            <p className="text-sm text-zinc-400">
              Match YouTube clips, print bingo sheets, or launch the host board.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            {decks.length} {decks.length === 1 ? "Deck" : "Decks"} Available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => {
            const matchedCount = deck.tracks.filter(
              (t) => t.matchStatus === "matched" || t.matchStatus === "manual"
            ).length;
            const hasEnoughTracks = deck.tracks.length >= 24;

            return (
              <div
                key={deck.id}
                className="group relative bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-3xl p-6 shadow-xl transition-all hover:shadow-2xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      <Music className="w-6 h-6" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => exportDeck(deck)}
                        title="Export deck as JSON"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateDeck(deck.id)}
                        title="Duplicate deck"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete deck "${deck.name}"?`)) {
                            deleteDeck(deck.id);
                          }
                        }}
                        title="Delete deck"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {deck.name}
                  </h3>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-zinc-950 font-medium text-zinc-300 border border-zinc-800">
                      {deck.tracks.length} tracks
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-md font-medium border ${
                        matchedCount === deck.tracks.length && deck.tracks.length > 0
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {matchedCount}/{deck.tracks.length} matched
                    </span>
                    {!hasEnoughTracks && (
                      <span className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                        &lt;24 tracks
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-zinc-800/80 grid grid-cols-3 gap-2">
                  <Link
                    to={`/deck/${deck.id}`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors border border-zinc-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </Link>
                  <Link
                    to={`/deck/${deck.id}/cards`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors border border-zinc-700"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Cards
                  </Link>
                  <Link
                    to={`/deck/${deck.id}/play`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Play
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
