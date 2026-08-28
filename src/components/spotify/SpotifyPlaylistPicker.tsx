import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@miquelt9/pc-ui";
import { useAuth } from "../../state/AuthContext";
import { useDeck } from "../../state/DeckContext";
import {
  createDeckFromSpotify,
  fetchAllPlaylistTracks,
  fetchUserPlaylists,
  SpotifyPlaylistSummary,
} from "../../lib/spotify/playlists";
import { AlertCircle, Loader2, LogIn, LogOut, Music } from "lucide-react";

export const SpotifyPlaylistPicker: React.FC = () => {
  const { isConfigured, isAuthenticated, isLoading: authLoading, accessToken, login, logout, error: authError } =
    useAuth();
  const { createDeck } = useDeck();
  const navigate = useNavigate();

  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    if (!accessToken) return;

    setIsLoadingPlaylists(true);
    setLoadError(null);
    try {
      const items = await fetchUserPlaylists(accessToken);
      setPlaylists(items);
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load playlists.");
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      void loadPlaylists();
    } else {
      setPlaylists([]);
    }
  }, [isAuthenticated, accessToken, loadPlaylists]);

  const handleImport = async (playlist: SpotifyPlaylistSummary) => {
    if (!accessToken || importingId) return;

    setImportingId(playlist.id);
    setImportError(null);
    setImportProgress({ loaded: 0, total: playlist.totalTracks || 0 });

    try {
      const tracks = await fetchAllPlaylistTracks(playlist.id, accessToken, (loaded, total) => {
        setImportProgress({ loaded, total });
      });

      if (tracks.length === 0) {
        throw new Error("No playable tracks found in that playlist.");
      }

      const deck = createDeckFromSpotify(playlist, tracks);
      const saved = createDeck(deck);
      navigate(`/deck/${saved.id}?autostart=match`);
    } catch (err) {
      setImportError((err as Error).message || "Failed to import playlist.");
    } finally {
      setImportingId(null);
      setImportProgress(null);
    }
  };

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs">Pick a playlist to import. YouTube matching starts automatically in the editor.</p>
        <Button type="button" onClick={logout} className="shrink-0">
          <LogOut className="w-4 h-4" />
          Disconnect
        </Button>
      </div>

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
        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {playlists.map((playlist) => {
            const isImporting = importingId === playlist.id;
            return (
              <button
                key={playlist.id}
                type="button"
                disabled={Boolean(importingId)}
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
