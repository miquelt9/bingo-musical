import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, Search, Volume2 } from "lucide-react";
import { MusicProvider, Track } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { formatDuration } from "../../lib/youtube/search";
import {
  SuggestHit,
  SUGGEST_PAGE_SIZE,
  SUGGEST_RESULT_CAP,
  songIdentityKey,
  suggestHitId,
  suggestHitPlayable,
  suggestHitToTrack,
  suggestSongs,
} from "../../lib/music/suggest";
import { getProviderLabel } from "../../lib/music/providers";

interface SuggestSongsModalProps {
  provider: MusicProvider;
  seeds: Track[];
  existingIds: Array<string | null | undefined>;
  existingTracks?: Array<Pick<Track, "title" | "artist">>;
  title?: string;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
  onAddTracks?: (tracks: Track[]) => void;
}

function hitToPreviewTrack(item: SuggestHit): Track {
  const track = suggestHitToTrack(item);
  track.id = suggestHitId(item);
  if (!suggestHitPlayable(item)) track.media = null;
  return track;
}

function hitSubtitle(item: SuggestHit): string {
  if (item.provider === "deezer") {
    return `${item.hit.artist}${item.hit.album ? ` · ${item.hit.album}` : ""}`;
  }
  const artist = item.catalog?.artist || item.hit.author;
  const duration = item.hit.lengthSeconds > 0 ? ` · ${formatDuration(item.hit.lengthSeconds)}` : "";
  return `${artist}${duration}`;
}

function hitTitle(item: SuggestHit): string {
  if (item.provider === "deezer") return item.hit.title;
  return item.catalog?.title || item.hit.title;
}

function hitArtUrl(item: SuggestHit): string {
  if (item.provider === "deezer") return item.hit.albumArtUrl;
  return item.catalog?.artworkUrl || item.hit.thumbnailUrl;
}

function hitAsTrackIdentity(item: SuggestHit): Pick<Track, "title" | "artist"> {
  if (item.provider === "deezer") {
    return { title: item.hit.title, artist: item.hit.artist };
  }
  return {
    title: item.catalog?.title || item.hit.title,
    artist: item.catalog?.artist || item.hit.author,
  };
}

export const SuggestSongsModal: React.FC<SuggestSongsModalProps> = ({
  provider,
  seeds,
  existingIds,
  existingTracks = [],
  title,
  onClose,
  onAddTrack,
  onAddTracks,
}) => {
  const [hits, setHits] = useState<SuggestHit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);
  const seedsRef = useRef(seeds);
  const excludeRef = useRef(existingIds);
  const excludeTracksRef = useRef(existingTracks);
  const hitsRef = useRef<SuggestHit[]>([]);
  seedsRef.current = seeds;
  excludeRef.current = existingIds;
  excludeTracksRef.current = existingTracks;
  hitsRef.current = hits;
  const alreadyInDeck = new Set([
    ...existingIds.filter((id): id is string => Boolean(id)),
    ...addedIds,
  ]);

  const seedKey = seeds.map((seed) => seed.id).join(",");

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);
    setHits([]);
    setAddedIds(new Set());
    setHasMoreResults(false);

    const snapshotSeeds = seedsRef.current;
    const snapshotExclude = excludeRef.current;
    const snapshotExcludeTracks = excludeTracksRef.current;

    void (async () => {
      try {
        const next = await suggestSongs({
          provider,
          seeds: snapshotSeeds,
          excludeIds: snapshotExclude,
          excludeTracks: snapshotExcludeTracks,
          limit: SUGGEST_RESULT_CAP,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHits(next);
        setHasMoreResults(next.length >= SUGGEST_PAGE_SIZE);
        if (next.length === 0) {
          setError(`No similar ${getProviderLabel(provider)} songs found. Try adding more songs first.`);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError((err as Error).message || "Could not load suggestions.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [provider, seedKey]);

  const loadMoreSuggestions = async () => {
    if (isLoading || isLoadingMore || !hasMoreResults) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoadingMore(true);
    setError(null);

    const shown = hitsRef.current;
    const shownIds = shown.map(suggestHitId);
    const shownTracks = shown.map(hitAsTrackIdentity);

    try {
      const next = await suggestSongs({
        provider,
        seeds: seedsRef.current,
        excludeIds: [...excludeRef.current, ...shownIds],
        excludeTracks: [...excludeTracksRef.current, ...shownTracks],
        limit: SUGGEST_PAGE_SIZE,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const seenIds = new Set(shownIds);
      const seenSongs = new Set(
        shownTracks.map((track) => songIdentityKey(track.artist, track.title)).filter((key) => key !== "::")
      );
      const unique = next.filter((item) => {
        const id = suggestHitId(item);
        if (seenIds.has(id)) return false;
        const identity = hitAsTrackIdentity(item);
        const key = songIdentityKey(identity.artist, identity.title);
        if (key !== "::" && seenSongs.has(key)) return false;
        return true;
      });

      if (unique.length === 0) {
        setHasMoreResults(false);
        return;
      }
      setHits((current) => [...current, ...unique]);
      setHasMoreResults(next.length >= SUGGEST_PAGE_SIZE);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError((err as Error).message || "Could not load more suggestions.");
      }
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false);
    }
  };

  const addHit = (item: SuggestHit) => {
    const id = suggestHitId(item);
    if (alreadyInDeck.has(id) || !suggestHitPlayable(item)) return;
    setAddingId(id);
    try {
      onAddTrack(suggestHitToTrack(item));
      setAddedIds((current) => new Set(current).add(id));
      setHits((current) => current.filter((entry) => suggestHitId(entry) !== id));
    } finally {
      setAddingId(null);
    }
  };

  const addAllPlayable = () => {
    const playable = hits.filter(
      (item) => suggestHitPlayable(item) && !alreadyInDeck.has(suggestHitId(item))
    );
    if (playable.length === 0) return;
    const seen = new Set<string>();
    const unique = playable.filter((item) => {
      const identity = hitAsTrackIdentity(item);
      const key = songIdentityKey(identity.artist, identity.title);
      if (key === "::" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const tracks = unique.map(suggestHitToTrack);
    if (onAddTracks) onAddTracks(tracks);
    else tracks.forEach(onAddTrack);
    setHits([]);
    setHasMoreResults(false);
    setAddedIds((current) => {
      const next = new Set(current);
      unique.forEach((item) => next.add(suggestHitId(item)));
      return next;
    });
  };

  const modalTitle =
    title ||
    (seeds.length === 1
      ? `More songs like ${seeds[0].artist}`
      : `Suggested songs (${seeds.length} seeds)`);

  return (
    <PcModal title={modalTitle} onClose={onClose} className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <p className="text-xs mb-3">
        Other songs from artists in this deck (not alternate uploads of the same track). Only
        playable {getProviderLabel(provider)} results are shown.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs pc-bevel-inset p-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Finding similar songs…
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-2 text-xs pc-bevel-inset p-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && hits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>
              {hits.length} suggestion{hits.length === 1 ? "" : "s"}
            </span>
            {hits.some((item) => suggestHitPlayable(item)) && (
              <button type="button" className="pc-link bg-transparent border-0" onClick={addAllPlayable}>
                Add all playable
              </button>
            )}
          </div>
          <div className="space-y-2 pc-bevel-inset p-2">
            {hits.map((item) => {
              const id = suggestHitId(item);
              const added = alreadyInDeck.has(id);
              const playable = suggestHitPlayable(item);
              return (
                <div key={id} className="flex items-center gap-3 p-2 pc-bevel-outset">
                  <img
                    src={hitArtUrl(item)}
                    alt=""
                    className={
                      item.provider === "youtube"
                        ? "w-24 h-14 object-cover shrink-0"
                        : "w-16 h-16 object-cover shrink-0"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{hitTitle(item)}</p>
                    <p className="text-xs truncate">{hitSubtitle(item)}</p>
                    <p
                      className={`text-[11px] mt-1 flex items-center gap-1 ${
                        playable ? "text-pc-success" : "text-pc-warning"
                      }`}
                    >
                      {playable ? <Volume2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {playable
                        ? item.provider === "deezer"
                          ? "30-second preview available"
                          : "Playable in game"
                        : "Unavailable"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ClipPreviewButton
                      track={hitToPreviewTrack(item)}
                      size="sm"
                      showLabel
                      className="!h-8 !min-h-8"
                    />
                    <button
                      type="button"
                      disabled={added || !playable || addingId === id}
                      onClick={() => addHit(item)}
                      className={`pc-button inline-flex items-center justify-center gap-1.5 shrink-0 h-8 !min-h-8 px-2.5 py-1 text-xs ${
                        added ? "active" : playable ? "pc-button--primary" : ""
                      }`}
                    >
                      {addingId === id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : added ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {added ? "Added" : playable ? "Add" : "Unavailable"}
                    </button>
                  </div>
                </div>
              );
            })}
            {hasMoreResults && (
              <button
                type="button"
                onClick={() => void loadMoreSuggestions()}
                disabled={isLoadingMore}
                className="pc-button w-full inline-flex items-center justify-center gap-2"
              >
                {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isLoadingMore ? "Finding more…" : "Find more"}
              </button>
            )}
          </div>
        </div>
      )}
    </PcModal>
  );
};
