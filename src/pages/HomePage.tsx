import React, { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { useAuth } from "../state/AuthContext";
import {
  parseSpotifyPlaylistId,
  fetchPlaylistDetails,
  fetchAllPlaylistTracks,
  fetchUserPlaylists,
  createDeckFromSpotify,
  SpotifyPlaylistSummary,
} from "../lib/spotify/playlists";
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
  ListMusic,
  AlertCircle,
  Loader2,
} from "lucide-react";

export const HomePage: React.FC = () => {
  const { decks, createDeck, deleteDeck, duplicateDeck, exportDeck, importDeck } = useDeck();
  const { isAuthenticated, accessToken, login } = useAuth();
  const navigate = useNavigate();

  // Spotify import states
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [isImportingSpotify, setIsImportingSpotify] = useState(false);
  const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  // User Library Modal
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // File import ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle URL import
  const handleImportByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpotifyError(null);

    const playlistId = parseSpotifyPlaylistId(playlistUrl);
    if (!playlistId) {
      setSpotifyError("Please enter a valid Spotify playlist URL or ID (e.g. https://open.spotify.com/playlist/...)");
      return;
    }

    if (!isAuthenticated || !accessToken) {
      setSpotifyError("Please connect your Spotify account first to import playlists.");
      return;
    }

    try {
      setIsImportingSpotify(true);
      setImportProgress({ loaded: 0, total: 0 });

      const details = await fetchPlaylistDetails(playlistId, accessToken);
      const tracks = await fetchAllPlaylistTracks(playlistId, accessToken, (loaded, total) => {
        setImportProgress({ loaded, total });
      });

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in this playlist.");
      }

      const newDeck = createDeckFromSpotify(details, tracks);
      const saved = createDeck(newDeck);
      setPlaylistUrl("");
      navigate(`/deck/${saved.id}`);
    } catch (err) {
      console.error("Spotify import error:", err);
      setSpotifyError((err as Error).message || "Failed to import playlist.");
    } finally {
      setIsImportingSpotify(false);
      setImportProgress(null);
    }
  };

  // Open user library picker
  const handleOpenLibrary = async () => {
    if (!isAuthenticated || !accessToken) {
      login().catch(() => navigate("/settings"));
      return;
    }

    setShowLibraryModal(true);
    setLoadingLibrary(true);
    try {
      const list = await fetchUserPlaylists(accessToken);
      setUserPlaylists(list);
    } catch (err) {
      console.error("Failed to load user playlists:", err);
      setSpotifyError((err as Error).message);
    } finally {
      setLoadingLibrary(false);
    }
  };

  const handleSelectPlaylistFromLibrary = async (playlist: SpotifyPlaylistSummary) => {
    if (!accessToken) return;
    setShowLibraryModal(false);
    setIsImportingSpotify(true);
    setSpotifyError(null);

    try {
      const tracks = await fetchAllPlaylistTracks(playlist.id, accessToken, (loaded, total) => {
        setImportProgress({ loaded, total });
      });

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in this playlist.");
      }

      const newDeck = createDeckFromSpotify(playlist, tracks);
      const saved = createDeck(newDeck);
      navigate(`/deck/${saved.id}`);
    } catch (err) {
      console.error("Spotify import error:", err);
      setSpotifyError((err as Error).message || "Failed to import playlist.");
    } finally {
      setIsImportingSpotify(false);
      setImportProgress(null);
    }
  };

  // Handle JSON file upload
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

  // Create empty manual deck
  const handleCreateEmptyDeck = () => {
    const now = new Date().toISOString();
    const newDeck = createDeck({
      schemaVersion: 1,
      id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: "New Custom Deck",
      createdAt: now,
      updatedAt: now,
      source: { type: "manual" },
      tracks: [],
    });
    navigate(`/deck/${newDeck.id}`);
  };

  return (
    <div className="space-y-12">
      {/* Hero Ingest Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 p-8 sm:p-12 shadow-2xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Turn Any Spotify Playlist Into An Interactive Game</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Musical Bingo Creator
          </h1>
          <p className="mt-3 text-base sm:text-lg text-zinc-400">
            Paste a Spotify playlist link or choose from your library. We'll automatically map tracks, match YouTube audio clips, generate printable 5x5 cards, and host live games!
          </p>

          {/* Spotify Input Form */}
          <form onSubmit={handleImportByUrl} className="mt-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => {
                    setPlaylistUrl(e.target.value);
                    setSpotifyError(null);
                  }}
                  placeholder="Paste Spotify Playlist URL (e.g. https://open.spotify.com/playlist/...)"
                  disabled={isImportingSpotify}
                  className="w-full px-5 py-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder-zinc-500 outline-none transition-all shadow-inner"
                />
              </div>

              <button
                type="submit"
                disabled={isImportingSpotify || !playlistUrl.trim()}
                className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-zinc-950 font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
              >
                {isImportingSpotify ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {importProgress && importProgress.total > 0
                        ? `Ingesting (${importProgress.loaded}/${importProgress.total})...`
                        : "Ingesting..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Import Playlist</span>
                  </>
                )}
              </button>
            </div>

            {spotifyError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-3 rounded-xl border border-red-500/30">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{spotifyError}</span>
              </div>
            )}
          </form>

          {/* Quick Action Links */}
          <div className="mt-6 pt-6 border-t border-zinc-800/80 flex flex-wrap items-center gap-4 text-xs">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleOpenLibrary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
              >
                <ListMusic className="w-4 h-4 text-emerald-400" />
                <span>Choose From My Spotify Library</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => login().catch(() => navigate("/settings"))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
              >
                <ListMusic className="w-4 h-4 text-emerald-400" />
                <span>Connect Spotify Account</span>
              </button>
            )}

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
              <span>Import JSON Deck</span>
            </button>

            <button
              type="button"
              onClick={handleCreateEmptyDeck}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4 text-zinc-400" />
              <span>Create Empty Deck</span>
            </button>
          </div>
        </div>
      </section>

      {/* Saved Decks Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Your Musical Decks</h2>
            <p className="text-sm text-zinc-400">
              Manage tracks, print customized bingo sheets, or launch the host control board.
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
                  {/* Top info */}
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

                  {/* Title & Stats */}
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

                {/* Primary Action Buttons */}
                <div className="mt-6 pt-5 border-t border-zinc-800/80 grid grid-cols-3 gap-2">
                  <Link
                    to={`/deck/${deck.id}`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors border border-zinc-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </Link>

                  <Link
                    to={`/deck/${deck.id}/cards`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors border border-zinc-700"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </Link>

                  <Link
                    to={`/deck/${deck.id}/play`}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Play</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Spotify Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div>
                <h3 className="text-xl font-bold text-white">Your Spotify Playlists</h3>
                <p className="text-xs text-zinc-400">Select any playlist to import its tracks as a bingo deck.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
              {loadingLibrary ? (
                <div className="py-12 text-center text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm">Fetching your Spotify library playlists...</p>
                </div>
              ) : userPlaylists.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">
                  <ListMusic className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="text-sm">No playlists found in your Spotify library.</p>
                </div>
              ) : (
                userPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => handleSelectPlaylistFromLibrary(pl)}
                    className="w-full flex items-center gap-4 p-3 rounded-2xl bg-zinc-950/60 hover:bg-emerald-500/10 border border-zinc-800/80 hover:border-emerald-500/30 transition-all text-left group"
                  >
                    {pl.imageUrl ? (
                      <img
                        src={pl.imageUrl}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover border border-zinc-700 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                        <Music className="w-6 h-6" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                        {pl.name}
                      </h4>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {pl.totalTracks} tracks • by {pl.ownerName}
                      </p>
                    </div>

                    <span className="px-3 py-1.5 rounded-xl bg-zinc-800 group-hover:bg-emerald-500 group-hover:text-zinc-950 text-xs font-bold transition-all text-zinc-200 shrink-0">
                      Import
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
