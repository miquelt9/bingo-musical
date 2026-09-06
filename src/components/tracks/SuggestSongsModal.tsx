import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, Volume2 } from "lucide-react";
import { MusicProvider, Track } from "../../types/deck";
import { PcModal } from "../ui/PcModal";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { formatDuration } from "../../lib/youtube/search";
import {
  SuggestHit,
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
  const duration = item.hit.lengthSeconds > 0 ? ` · ${formatDuration(item.hit.lengthSeconds)}` : "";
  return `${item.hit.author}${duration}`;
}

function hitArtUrl(item: SuggestHit): string {
  return item.provider === "deezer" ? item.hit.albumArtUrl : item.hit.thumbnailUrl;
}

export const SuggestSongsModal: React.FC<SuggestSongsModalProps> = ({
  provider,
  seeds,
  existingIds,
  title,
  onClose,
  onAddTrack,
  onAddTracks,
}) => {
  const [hits, setHits] = useState<SuggestHit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);
  const seedsRef = useRef(seeds);
  const excludeRef = useRef(existingIds);
  seedsRef.current = seeds;
  excludeRef.current = existingIds;
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
    setError(null);
    setHits([]);
    setAddedIds(new Set());

    const snapshotSeeds = seedsRef.current;
    const snapshotExclude = excludeRef.current;

    void (async () => {
      try {
        const next = await suggestSongs({
          provider,
          seeds: snapshotSeeds,
          excludeIds: snapshotExclude,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHits(next);
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
    const tracks = playable.map(suggestHitToTrack);
    if (onAddTracks) onAddTracks(tracks);
    else tracks.forEach(onAddTrack);
    setHits([]);
    setAddedIds((current) => {
      const next = new Set(current);
      playable.forEach((item) => next.add(suggestHitId(item)));
      return next;
    });
  };

  const modalTitle =
    title ||
    (seeds.length === 1
      ? `Similar to ${seeds[0].title}`
      : `Suggested songs (${seeds.length} seeds)`);

  return (
    <PcModal title={modalTitle} onClose={onClose} className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <p className="text-xs mb-3">
        Suggestions based on songs already in this deck. Only playable{" "}
        {getProviderLabel(provider)} results are shown.
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
                    <p className="text-sm font-semibold truncate">{item.hit.title}</p>
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
          </div>
        </div>
      )}
    </PcModal>
  );
};
