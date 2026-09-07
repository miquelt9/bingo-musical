import React, { useEffect, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Loader2, Plus, Search, Volume2 } from "lucide-react";
import { Track } from "../../types/deck";
import {
  DeezerTrackHit,
  deezerHitToTrack,
  isDeezerApiConfigured,
  parseDeezerTrackId,
  resolveDeezerTrack,
  searchDeezerTracks,
} from "../../lib/deezer/api";
import { ClipPreviewButton } from "./ClipPreviewButton";

interface DeezerSongSearchProps {
  existingIds?: Array<string | null | undefined>;
  onAddTrack: (track: Track) => void;
  onAddTracks?: (tracks: Track[]) => void;
  onAfterAdd?: () => void;
}

/** Stable-id track so preview play/stop state survives re-renders. */
function hitToPreviewTrack(hit: DeezerTrackHit): Track {
  const track = deezerHitToTrack(hit);
  track.id = hit.id;
  if (!hit.previewUrl) track.media = null;
  return track;
}

export const DeezerSongSearch: React.FC<DeezerSongSearchProps> = ({
  existingIds = [],
  onAddTrack,
  onAddTracks,
  onAfterAdd,
}) => {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DeezerTrackHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextIndex, setNextIndex] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearchQueryRef = useRef("");
  const hitsRef = useRef<DeezerTrackHit[]>([]);
  hitsRef.current = hits;
  const alreadyInDeck = new Set(existingIds.filter((id): id is string => Boolean(id)));

  useEffect(() => () => abortRef.current?.abort(), []);

  const addHit = async (hit: DeezerTrackHit) => {
    if (alreadyInDeck.has(hit.id)) return;
    if (!hit.previewUrl) {
      setError("This Deezer track has no preview and cannot be played in a bingo game.");
      return;
    }
    setAddingId(hit.id);
    setError(null);
    try {
      onAddTrack(deezerHitToTrack(hit));
      setHits((current) => current.filter((item) => item.id !== hit.id));
      onAfterAdd?.();
    } finally {
      setAddingId(null);
    }
  };

  const addAllPlayable = () => {
    const playable = hits.filter((hit) => hit.previewUrl && !alreadyInDeck.has(hit.id));
    if (playable.length === 0) return;
    const tracks = playable.map(deezerHitToTrack);
    if (onAddTracks) onAddTracks(tracks);
    else tracks.forEach(onAddTrack);
    setHits([]);
    setHasMoreResults(false);
    onAfterAdd?.();
  };

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setIsLoadingMore(false);
    setError(null);
    setHasMoreResults(false);
    setNextIndex(0);
    try {
      const trackId = parseDeezerTrackId(value);
      const nextHits = trackId
        ? [await resolveDeezerTrack(trackId, controller.signal)]
        : await searchDeezerTracks(value, 8, controller.signal, 0);
      if (!controller.signal.aborted) {
        lastSearchQueryRef.current = trackId ? "" : value;
        setHits(nextHits);
        setNextIndex(nextHits.length);
        setHasMoreResults(!trackId && nextHits.length >= 8);
        if (nextHits.length === 0) setError("No Deezer tracks found. Try another search.");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message || "Deezer search failed.");
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  };

  const loadMoreResults = async () => {
    const value = lastSearchQueryRef.current.trim();
    if (!value || isLoadingMore || isSearching) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoadingMore(true);
    setError(null);
    try {
      const moreHits = await searchDeezerTracks(value, 8, controller.signal, nextIndex);
      if (controller.signal.aborted) return;
      if (moreHits.length === 0) {
        setHasMoreResults(false);
        return;
      }
      const seen = new Set(hitsRef.current.map((hit) => hit.id));
      const unique = moreHits.filter((hit) => !seen.has(hit.id));
      if (unique.length === 0) {
        setHasMoreResults(false);
        return;
      }
      setHits((current) => [...current, ...unique]);
      setNextIndex((current) => current + moreHits.length);
      setHasMoreResults(moreHits.length >= 8);
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message || "Could not load more results.");
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false);
    }
  };

  if (!isDeezerApiConfigured()) {
    return (
      <div className="pc-bevel-inset p-3 text-xs flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 text-pc-warning" />
        <span>Deezer search is unavailable because the metadata Worker is not configured. YouTube decks still work normally.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Song, artist, or Deezer track URL…"
            disabled={isSearching}
            className="pc-input w-full pl-8"
          />
        </div>
        <Button type="submit" variant="primary" disabled={isSearching || !query.trim()}>
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {isSearching ? "Searching…" : "Search Deezer"}
        </Button>
      </form>
      <p className="text-xs">Search Deezer metadata or paste a numeric track ID / track URL. Only Deezer’s short preview is used.</p>
      {error && <div className="pc-bevel-inset p-2 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      {hits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>{hits.length} Deezer result{hits.length === 1 ? "" : "s"}</span>
            {hits.some((hit) => hit.previewUrl) && <button type="button" className="pc-link" onClick={addAllPlayable}>Add all playable</button>}
          </div>
          <div className="space-y-2 pc-bevel-inset p-2">
            {hits.map((hit) => {
              const added = alreadyInDeck.has(hit.id);
              const playable = Boolean(hit.previewUrl);
              return (
                <div key={hit.id} className="flex items-center gap-3 p-2 pc-bevel-outset">
                  <img src={hit.albumArtUrl} alt="" className="w-16 h-16 object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{hit.title}</p>
                    <p className="text-xs truncate">{hit.artist}{hit.album ? ` · ${hit.album}` : ""}</p>
                    <p className={`text-[11px] mt-1 flex items-center gap-1 ${playable ? "text-pc-success" : "text-pc-warning"}`}>
                      {playable ? <Volume2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {playable ? "30-second preview available" : "No preview available"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ClipPreviewButton track={hitToPreviewTrack(hit)} size="sm" showLabel className="!h-8 !min-h-8" />
                    <button type="button" disabled={added || !playable || addingId === hit.id} onClick={() => void addHit(hit)} className={`pc-button inline-flex items-center justify-center gap-1.5 shrink-0 h-8 !min-h-8 px-2.5 py-1 text-xs ${added ? "active" : playable ? "pc-button--primary" : ""}`}>
                      {addingId === hit.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {added ? "Added" : playable ? "Add" : "Unavailable"}
                    </button>
                  </div>
                </div>
              );
            })}
            {hasMoreResults && (
              <button
                type="button"
                onClick={() => void loadMoreResults()}
                disabled={isLoadingMore || isSearching}
                className="pc-button w-full inline-flex items-center justify-center gap-2"
              >
                {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isLoadingMore ? "Finding more…" : "Find more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
