import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { Track, Deck } from "../types/deck";
import { TrackTable } from "../components/tracks/TrackTable";
import { batchMatchTracks, BatchMatchProgress } from "../lib/youtube/matcher";
import {
  Edit3,
  Printer,
  Radio,
  Download,
  Plus,
  AlertTriangle,
  ArrowLeft,
  Check,
} from "lucide-react";

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decks, loadDeck, updateDeck, exportDeck } = useDeck();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [deckName, setDeckName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  // Matcher states
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState<BatchMatchProgress | null>(null);
  const cancelMatchingRef = useRef(false);

  // Add track modal
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newAlbum, setNewAlbum] = useState("");

  useEffect(() => {
    if (!id) return;
    const found = loadDeck(id);
    if (found) {
      setDeck(found);
      setDeckName(found.name);
    } else {
      // If deck not found, fallback to first available or home
      if (decks.length > 0) {
        navigate(`/deck/${decks[0].id}`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [id, loadDeck, decks, navigate]);

  if (!deck) {
    return (
      <div className="py-24 text-center text-zinc-400">
        <p>Loading deck...</p>
      </div>
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

  const handleAddTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newArtist.trim()) return;

    const newTrack: Track = {
      id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: newTitle.trim(),
      artist: newArtist.trim(),
      album: newAlbum.trim() || undefined,
      albumArtUrl: "",
      durationMs: 180000,
      youtubeVideoId: null,
      startTime: 30,
      endTime: 45,
      matchStatus: "pending",
    };

    const newTracks = [newTrack, ...deck.tracks];
    const newDeck = { ...deck, tracks: newTracks };
    setDeck(newDeck);
    updateDeck(newDeck);

    setNewTitle("");
    setNewArtist("");
    setNewAlbum("");
    setShowAddTrackModal(false);
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
          // Progressively update local state
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

  const matchedCount = deck.tracks.filter(
    (t) => t.matchStatus === "matched" || t.matchStatus === "manual"
  ).length;
  const hasEnoughTracks = deck.tracks.length >= 24;

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Decks</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportDeck(deck)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <Link
            to={`/deck/${deck.id}/cards`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 transition-colors"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Bingo Cards</span>
          </Link>

          <Link
            to={`/deck/${deck.id}/play`}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
          >
            <Radio className="w-4 h-4" />
            <span>Host Live Game</span>
          </Link>
        </div>
      </div>

      {/* Deck Header & Title Editor */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2 max-w-xl">
                <input
                  type="text"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-950 border border-emerald-500 text-xl font-bold text-white outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDeckName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveDeckName}
                  className="p-2.5 rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                >
                  <Check className="w-5 h-5 stroke-[3]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight truncate">
                  {deck.name}
                </h1>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                  title="Rename deck"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">
                {deck.tracks.length} Total Tracks
              </span>
              <span>•</span>
              <span className="font-semibold text-emerald-400">
                {matchedCount} Matched on YouTube
              </span>
              {deck.source?.type === "spotify-playlist" && (
                <>
                  <span>•</span>
                  <span className="text-zinc-400">Imported from Spotify</span>
                </>
              )}
            </div>
          </div>

          {/* Add Track Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddTrackModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Song</span>
            </button>
          </div>
        </div>

        {/* Warning Banner if < 24 tracks */}
        {!hasEnoughTracks && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">
              <p className="font-bold">Minimum 24 unique songs required for 5x5 Bingo Cards.</p>
              <p className="mt-0.5 text-amber-300/80">
                You currently have {deck.tracks.length} tracks. Please import more tracks or add songs manually so cards can be uniquely sampled without repeating items.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Track List Table */}
      <TrackTable
        tracks={deck.tracks}
        onUpdateTrack={handleUpdateTrack}
        onDeleteTrack={handleDeleteTrack}
        onAutoMatchAll={handleAutoMatchAll}
        isMatching={isMatching}
        matchProgress={matchProgress}
      />

      {/* Add Custom Track Modal */}
      {showAddTrackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Add Custom Song</h3>
            <p className="text-xs text-zinc-400 mb-6">
              Enter track details. You can link a YouTube video immediately or search later.
            </p>

            <form onSubmit={handleAddTrack} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Song Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Bohemian Rhapsody"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Artist Name *
                </label>
                <input
                  type="text"
                  value={newArtist}
                  onChange={(e) => setNewArtist(e.target.value)}
                  placeholder="e.g. Queen"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Album Name (Optional)
                </label>
                <input
                  type="text"
                  value={newAlbum}
                  onChange={(e) => setNewAlbum(e.target.value)}
                  placeholder="e.g. A Night at the Opera"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddTrackModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
                >
                  Add Track
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
