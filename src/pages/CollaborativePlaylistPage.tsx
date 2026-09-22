import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Window } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Download, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { PageHeader } from "../components/layout/PageHeader";
import { SongSearch } from "../components/tracks/SongSearch";
import { ClipPreviewButton } from "../components/tracks/ClipPreviewButton";
import { Track } from "../types/deck";
import { songIdentityKey } from "../lib/music/songIdentity";

import { useDeck } from "../state/DeckContext";
import { useToast } from "../state/ToastContext";
import {
  appendCollaborativeTracks,
  CollaborativeApiError,
  CollaborativePlaylist,
  fetchCollaborativePlaylist,
} from "../lib/share/collaborativePlaylistsApi";
import { getProviderLabel } from "../lib/music/providers";
import { getYoutubeThumbnailUrl } from "../lib/youtube/parseUrl";

function trackKey(track: Track): string {
  return track.media ? `${track.media.provider}:${track.media.id}` : songIdentityKey(track.artist, track.title);
}

function mergeTracks(remote: Track[], pending: Track[]): Track[] {
  const result = [...remote];
  const seen = new Set(result.map(trackKey));
  for (const track of pending) {
    const key = trackKey(track);
    if (!seen.has(key)) { result.push(track); seen.add(key); }
  }
  return result;
}

export const CollaborativePlaylistPage: React.FC = () => {
  const { collaborationId } = useParams<{ collaborationId: string }>();
  const navigate = useNavigate();
  const { createDeck, loadDeck } = useDeck();
  const { showToast } = useToast();
  const [playlist, setPlaylist] = useState<CollaborativePlaylist | null>(null);
  const [pending, setPending] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const revisionRef = useRef(-1);
  const playlistRef = useRef<CollaborativePlaylist | null>(null);
  const pendingRef = useRef<Track[]>([]);
  const queueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const hasLoadedRef = useRef(false);

  const displayedTracks = useMemo(() => mergeTracks(playlist?.tracks ?? [], pending), [playlist, pending]);

  const applyPlaylist = useCallback((next: CollaborativePlaylist, announce: boolean) => {
    if (next.revision <= revisionRef.current) return;
    const previous = playlistRef.current;
    const oldKeys = new Set((previous?.tracks ?? []).map(trackKey));
    const newCount = next.tracks.filter((track) => !oldKeys.has(trackKey(track))).length;
    revisionRef.current = next.revision;
    playlistRef.current = next;
    setPlaylist(next);
    const remainingPending = pendingRef.current.filter(
      (track) => !next.tracks.some((remote) => trackKey(remote) === trackKey(track))
    );
    pendingRef.current = remainingPending;
    setPending(remainingPending);
    if (announce && newCount > 0) showToast({ title: "Playlist updated", message: `${newCount} new song${newCount === 1 ? "" : "s"} added.`, duration: 4000 });
  }, [showToast]);

  const fetchLatest = useCallback(async (announce = false) => {
    if (!collaborationId) { setError("Missing collaboration link id."); setIsLoading(false); return null; }
    setIsRefreshing(true);
    try {
      const next = await fetchCollaborativePlaylist(collaborationId);
      if (next.format !== "bingo-musical-collaboration" || next.schemaVersion !== 1) throw new Error("This collaborative playlist has an unsupported format.");
      applyPlaylist(next, announce && hasLoadedRef.current);
      setError(null);
      hasLoadedRef.current = true;
      return next;
    } catch (err) {
      setError((err as Error).message || "Could not load this playlist.");
      return null;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [applyPlaylist, collaborationId]);

  useEffect(() => { void fetchLatest(); }, [fetchLatest]);

  useEffect(() => {
    const offline = () => setIsOnline(false);
    const online = () => setIsOnline(true);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  const enqueueTrack = (track: Track, force = false): Promise<boolean> => {
    const current = mergeTracks(playlistRef.current?.tracks ?? [], pendingRef.current);
    const alreadyPending = pendingRef.current.some((item) => trackKey(item) === trackKey(track));
    if (!force && current.some((item) => trackKey(item) === trackKey(track))) {
      showToast({ title: "Already in playlist", message: "That song is already present.", duration: 3000 });
      return Promise.resolve(true);
    }
    if (!alreadyPending) {
      const nextPending = [...pendingRef.current, track];
      pendingRef.current = nextPending;
      setPending(nextPending);
    }
    const operation = queueRef.current.then(async () => {
      let base = playlistRef.current?.revision ?? revisionRef.current;
      try {
        const fresh = await fetchLatest(false);
        if (!fresh) throw new Error("Could not read the latest playlist before adding this song.");
        base = fresh.revision;
        let response;
        try {
          response = await appendCollaborativeTracks(collaborationId!, base, [track]);
        } catch (err) {
          if (!(err instanceof CollaborativeApiError) || err.status !== 409) throw err;
          const fresh = await fetchLatest(false);
          if (!fresh) throw err;
          base = fresh.revision;
          response = await appendCollaborativeTracks(collaborationId!, base, [track]);
        }
        applyPlaylist(response.playlist, false);
        pendingRef.current = pendingRef.current.filter((item) => trackKey(item) !== trackKey(track));
        setPending(pendingRef.current);
        setError(null);
        if (response.duplicateTrackIds?.length) showToast({ title: "Already in playlist", message: "That song was added by someone else.", duration: 3000 });
        return true;
      } catch (err) {
        setError((err as Error).message || "Could not add this song. Your pending song is still here; retry when online.");
        return false;
      }
    });
    queueRef.current = operation.then(() => true, () => false);
    return operation;
  };

  const saveDeck = () => {
    if (!playlist) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const saved = createDeck({ schemaVersion: 2, id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: playlist.name, createdAt: now, updatedAt: now, provider: playlist.provider, source: { type: "manual", name: `Collaborative playlist ${playlist.id}` }, collaboration: { id: playlist.id, revision: playlist.revision }, tracks: displayedTracks });
      showToast({ title: "Added to my decks", message: `Saved ${saved.tracks.length} songs as “${saved.name}”.`, duration: 4000 });
      loadDeck(saved.id);
      navigate(`/deck/${saved.id}`, { replace: true });
    } finally { setIsSaving(false); }
  };

  const retryPending = () => {
    if (pendingRef.current.length) {
      pendingRef.current.forEach((track) => enqueueTrack(track, true));
    } else {
      void fetchLatest();
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader
        back={{ fallbackTo: "/", fallbackLabel: "All decks" }}
        title="Collaborative playlist"
        titleClassName="sm:hidden"
      />
      <Window title={playlist ? `Collaborative playlist — ${playlist.name}` : "Collaborative playlist"}>
        {isLoading ? <p className="text-sm inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading playlist…</p> : error && !playlist ? (
          <div className="space-y-3"><div className="pc-bevel-inset p-3 text-sm flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div><Button type="button" variant="primary" onClick={() => void fetchLatest()}><RefreshCw className="w-4 h-4" />Retry</Button><p className="text-xs">Check the link and your connection, then retry.</p></div>
        ) : playlist ? <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm">{getProviderLabel(playlist.provider)} · {displayedTracks.length} song{displayedTracks.length === 1 ? "" : "s"}</p><p className="text-xs opacity-70">Updates are checked manually · revision {playlist.revision}{!isOnline ? " · offline" : ""}</p></div><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void fetchLatest(true)} disabled={isRefreshing || !isOnline}><RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />{isRefreshing ? "Checking…" : "Check for updates"}</Button><Button type="button" onClick={saveDeck} disabled={isSaving}><Download className="w-4 h-4" />{isSaving ? "Saving…" : "Add to my decks"}</Button></div></div>
          {error && <div className="pc-bevel-inset p-3 text-xs flex flex-wrap items-center gap-2"><WifiOff className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span><Button type="button" onClick={retryPending}><RefreshCw className="w-3.5 h-3.5" />Retry</Button><Button type="button" onClick={() => void fetchLatest()}><RefreshCw className="w-3.5 h-3.5" />Reload playlist</Button></div>}
          {pending.length > 0 && <div className="pc-bevel-inset p-2 text-xs">{pending.length} song{pending.length === 1 ? "" : "s"} waiting to sync. They will not be lost if the network is unavailable.</div>}
          <div><h2 className="font-bold mb-2">Add songs</h2><p className="text-xs mb-3">Anyone with the link can add tracks. Check for updates to see songs added by collaborators. The app also checks the latest revision before each add.</p><SongSearch provider={playlist.provider} existingVideoIds={displayedTracks.map((track) => track.media?.id)} onAddTrack={enqueueTrack} onAddTracks={async (tracks) => {
                      const results = await Promise.all(tracks.map((track) => enqueueTrack(track)));
                      return results.every(Boolean);
                    }} /></div>
          <div><h2 className="font-bold mb-2">Songs in this playlist</h2><div className="pc-bevel-inset p-2 max-h-80 overflow-y-auto"><ul className="space-y-1 text-sm">{displayedTracks.map((track) => { const thumbnailUrl = track.albumArtUrl || (track.media?.provider === "youtube" ? getYoutubeThumbnailUrl(track.media.id, "mqdefault") : ""); return <li key={`${trackKey(track)}-${track.id}`} className="flex items-center gap-2 p-1.5">{thumbnailUrl ? <img src={thumbnailUrl} alt="" className="w-9 h-9 object-cover shrink-0 pc-bevel-inset" /> : <span className="w-9 h-9 shrink-0 flex items-center justify-center"><Check className="w-3.5 h-3.5 opacity-60" /></span>}<span className="min-w-0 flex-1 truncate">{track.artist} — {track.title}</span>{pending.some((item) => trackKey(item) === trackKey(track)) ? <span className="text-xs opacity-70">Syncing…</span> : track.media ? <ClipPreviewButton track={track} size="sm" /> : <Check className="w-3.5 h-3.5 text-pc-warning" />}</li>; })}</ul></div></div>
        </div> : null}
      </Window>
      <p className="text-xs text-center opacity-70">No account required. This link is the access.</p>
      {playlist && <Link to="/" className="pc-link text-xs">Go to my decks</Link>}
    </div>
  );
};
