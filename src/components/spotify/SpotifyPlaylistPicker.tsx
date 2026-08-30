import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@miquelt9/pc-ui";
import { useAuth } from "../../state/AuthContext";
import { useDeck } from "../../state/DeckContext";
import {
  createDeckFromLikedSongs,
  createDeckFromSpotify,
  fetchAllPlaylistTracks,
  fetchPlaylistDetails,
  fetchSavedTracks,
  fetchUserPlaylists,
  MAX_LIKED_SONGS,
  MAX_USER_PLAYLISTS,
  parseSpotifyPlaylistId,
  SpotifyPlaylistSummary,
} from "../../lib/spotify/playlists";
import { AlertCircle, Heart, Loader2, LogIn, LogOut, Music } from "lucide-react";

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export const SpotifyPlaylistPicker: React.FC = () => {
  const { isConfigured, isAuthenticated, isLoading: authLoading, accessToken, login, logout, error: authError } =
    useAuth();
  const { createDeck } = useDeck();
  const navigate = useNavigate();
  const importAbortRef = useRef<AbortController | null>(null);
  const playlistsAbortRef = useRef<AbortController | null>(null);

  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [playlistsTruncated, setPlaylistsTruncated] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isImportingPaste, setIsImportingPaste] = useState(false);
  const [isImportingLiked, setIsImportingLiked] = useState(false);

  useEffect(() => {
    return () => {
      playlistsAbortRef.current?.abort();
      importAbortRef.current?.abort();
    };
  }, []);

  const loadPlaylists = useCallback(async () => {
    if (!accessToken) return;

    playlistsAbortRef.current?.abort();
    const controller = new AbortController();
    playlistsAbortRef.current = controller;

    setIsLoadingPlaylists(true);
    setLoadError(null);
    try {
      const items = await fetchUserPlaylists(accessToken, controller.signal);
      if (controller.signal.aborted) return;
      setPlaylists(items);
      setPlaylistsTruncated(items.length >= MAX_USER_PLAYLISTS);
    } catch (err) {
      if (isAbortError(err)) return;
      setLoadError((err as Error).message || "Failed to load playlists.");
      setPlaylists([]);
      setPlaylistsTruncated(false);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingPlaylists(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      void loadPlaylists();
    } else {
      playlistsAbortRef.current?.abort();
      setPlaylists([]);
      setPlaylistsTruncated(false);
    }
  }, [isAuthenticated, accessToken, loadPlaylists]);

  const beginImport = () => {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    return controller;
  };

  const handleImport = async (playlist: SpotifyPlaylistSummary) => {
    if (!accessToken || importingId || isImportingPaste || isImportingLiked) return;

    const controller = beginImport();
    setImportingId(playlist.id);
    setImportError(null);
    setImportProgress({ loaded: 0, total: playlist.totalTracks || 0 });

    try {
      const tracks = await fetchAllPlaylistTracks(
        playlist.id,
        accessToken,
        (loaded, total) => {
          setImportProgress({ loaded, total });
        },
        controller.signal
      );

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in that playlist.");
      }

      const deck = createDeckFromSpotify(playlist, tracks);
      const saved = createDeck(deck);
      navigate(`/deck/${saved.id}?autostart=match`);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportError((err as Error).message || "Failed to import playlist.");
    } finally {
      if (!controller.signal.aborted) {
        setImportingId(null);
        setImportProgress(null);
      }
    }
  };

  const handlePasteImport = async () => {
    if (!accessToken || importingId || isImportingPaste || isImportingLiked) return;

    const playlistId = parseSpotifyPlaylistId(pasteUrl);
    if (!playlistId) {
      setPasteError("Enter a valid Spotify playlist URL or 22-character playlist ID.");
      return;
    }

    const controller = beginImport();
    setPasteError(null);
    setImportError(null);
    setIsImportingPaste(true);
    setImportProgress({ loaded: 0, total: 0 });

    try {
      const playlist = await fetchPlaylistDetails(playlistId, accessToken, controller.signal);
      setImportProgress({ loaded: 0, total: playlist.totalTracks || 0 });

      const tracks = await fetchAllPlaylistTracks(
        playlistId,
        accessToken,
        (loaded, total) => {
          setImportProgress({ loaded, total });
        },
        controller.signal
      );

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in that playlist.");
      }

      const deck = createDeckFromSpotify(playlist, tracks);
      const saved = createDeck(deck);
      navigate(`/deck/${saved.id}?autostart=match`);
    } catch (err) {
      if (isAbortError(err)) return;
      setPasteError((err as Error).message || "Failed to import playlist.");
    } finally {
      if (!controller.signal.aborted) {
        setIsImportingPaste(false);
        setImportProgress(null);
      }
    }
  };

  const handleImportLikedSongs = async () => {
    if (!accessToken || importingId || isImportingPaste || isImportingLiked) return;

    const controller = beginImport();
    setImportError(null);
    setPasteError(null);
    setIsImportingLiked(true);
    setImportProgress({ loaded: 0, total: 0 });

    try {
      const tracks = await fetchSavedTracks(
        accessToken,
        (loaded, total) => {
          setImportProgress({ loaded, total });
        },
        controller.signal
      );

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in your liked songs.");
      }

      const deck = createDeckFromLikedSongs(tracks);
      const saved = createDeck(deck);
      navigate(`/deck/${saved.id}?autostart=match`);
    } catch (err) {
      if (isAbortError(err)) return;
      setImportError((err as Error).message || "Failed to import liked songs.");
    } finally {
      if (!controller.signal.aborted) {
        setIsImportingLiked(false);
        setImportProgress(null);
      }
    }
  };

  const isBusy = Boolean(importingId) || isImportingPaste || isImportingLiked;

  if (!isConfigured) {
    return null;
  }

  if (authLoading) {
    return (
      <div className="pc-bevel-inset p-3 text-xs flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Checking Spotify connection…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-3">
        <p className="text-xs">
          Connect your Spotify account to import playlists you own or collaborate on. Playback still uses YouTube.
        </p>
        <Button type="button" onClick={() => login()}>
          <LogIn className="w-4 h-4" />
          Connect with Spotify
        </Button>
        {authError && (
          <div className="flex items-start gap-2 text-xs pc-bevel-inset p-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <p className="text-xs">Pick a playlist to import. YouTube matching starts automatically in the editor.</p>
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button type="button" onClick={() => void handleImportLikedSongs()} disabled={isBusy} className="w-full sm:w-auto">
            {isImportingLiked ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {importProgress
                  ? `Importing… ${importProgress.loaded}/${importProgress.total || "?"}`
                  : "Importing…"}
              </>
            ) : (
              <>
                <Heart className="w-4 h-4" />
                Import Liked Songs
              </>
            )}
          </Button>
          <Button type="button" onClick={logout} disabled={isBusy} className="w-full sm:w-auto">
            <LogOut className="w-4 h-4" />
            Disconnect
          </Button>
        </div>
        <p className="text-xs opacity-80">
          Liked songs import is capped at {MAX_LIKED_SONGS} tracks for performance.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="spotify-paste-url" className="text-xs font-semibold block">
          Paste playlist URL
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="spotify-paste-url"
            type="text"
            value={pasteUrl}
            onChange={(e) => {
              setPasteUrl(e.target.value);
              if (pasteError) setPasteError(null);
            }}
            placeholder="https://open.spotify.com/playlist/…"
            disabled={isBusy}
            className="flex-1 text-xs pc-bevel-inset px-2 py-1.5 min-w-0"
          />
          <Button
            type="button"
            onClick={() => void handlePasteImport()}
            disabled={isBusy || !pasteUrl.trim()}
            className="w-full sm:w-auto shrink-0"
          >
            {isImportingPaste ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {importProgress
                  ? `${importProgress.loaded}/${importProgress.total || "?"}`
                  : "Importing…"}
              </>
            ) : (
              "Import"
            )}
          </Button>
        </div>
        {pasteError && (
          <div className="flex items-start gap-2 text-xs pc-bevel-inset p-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{pasteError}</span>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold">Your playlists</p>

      {isLoadingPlaylists ? (
        <div className="pc-bevel-inset p-3 text-xs flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Loading your playlists…</span>
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2 text-xs pc-bevel-inset p-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      ) : playlists.length === 0 ? (
        <p className="text-xs pc-bevel-inset p-3">No playlists found on your Spotify account.</p>
      ) : (
        <>
          {playlistsTruncated && (
            <p className="text-xs opacity-80">
              Showing the first {MAX_USER_PLAYLISTS} playlists. Paste a URL above to import one not listed.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {playlists.map((playlist) => {
              const isImporting = importingId === playlist.id;
              return (
                <button
                  key={playlist.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleImport(playlist)}
                  className="w-full text-left pc-bevel-inset p-2 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60"
                >
                  {playlist.imageUrl ? (
                    <img
                      src={playlist.imageUrl}
                      alt=""
                      className="w-10 h-10 shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 shrink-0 pc-bevel-inset flex items-center justify-center">
                      <Music className="w-5 h-5 opacity-60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{playlist.name}</p>
                    <p className="text-xs opacity-80 truncate">
                      {playlist.totalTracks} track{playlist.totalTracks === 1 ? "" : "s"}
                      {playlist.ownerName ? ` · ${playlist.ownerName}` : ""}
                    </p>
                  </div>
                  {isImporting && (
                    <span className="text-xs shrink-0 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {importProgress
                        ? `${importProgress.loaded}/${importProgress.total || "?"}`
                        : "Importing…"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {importError && (
        <div className="flex items-start gap-2 text-xs pc-bevel-inset p-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{importError}</span>
        </div>
      )}
    </div>
  );
};
