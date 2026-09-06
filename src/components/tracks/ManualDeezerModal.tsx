import React, { useEffect, useRef, useState } from "react";
import { Button, Input } from "@miquelt9/pc-ui";
import { AlertCircle, Check, Loader2, Search, Volume2 } from "lucide-react";
import { Track } from "../../types/deck";
import {
  DeezerTrackHit,
  deezerHitToTrack,
  isDeezerApiConfigured,
  parseDeezerTrackId,
  resolveDeezerTrack,
  searchDeezerTracks,
} from "../../lib/deezer/api";
import { PcModal } from "../ui/PcModal";
import { ClipPreviewButton } from "./ClipPreviewButton";

interface ManualDeezerModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

function defaultSearchQuery(track: Track): string {
  return `${track.artist} - ${track.title}`;
}

/** Stable-id track so preview play/stop state survives re-renders. */
function hitToPreviewTrack(hit: DeezerTrackHit): Track {
  const preview = deezerHitToTrack(hit);
  preview.id = hit.id;
  if (!hit.previewUrl) preview.media = null;
  return preview;
}

export const ManualDeezerModal: React.FC<ManualDeezerModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const [searchQuery, setSearchQuery] = useState(() => defaultSearchQuery(track));
  const [hits, setHits] = useState<DeezerTrackHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [pasteValue, setPasteValue] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const [resolved, setResolved] = useState<ReturnType<typeof deezerHitToTrack> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchAbort = useRef<AbortController | null>(null);
  const resolveAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      searchAbort.current?.abort();
      resolveAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const query = defaultSearchQuery(track);
    setSearchQuery(query);
    setHits([]);
    setSearchError(null);
    setPasteValue(
      track.media?.provider === "deezer" ? track.media.providerUrl || track.media.id : ""
    );
    setPasteError(null);
    setResolved(null);
    setSelectedId(null);

    if (!isDeezerApiConfigured() || !query.trim()) return;

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setIsSearching(true);

    void (async () => {
      try {
        const nextHits = await searchDeezerTracks(query, 8, controller.signal);
        if (controller.signal.aborted) return;
        setHits(nextHits);
        if (nextHits.length === 0) {
          setSearchError("No Deezer tracks found. Try different keywords or paste a Deezer link below.");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchError((err as Error).message || "Deezer search failed.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isOpen, track]);

  const runSearch = async () => {
    const nextQuery = searchQuery.trim();
    if (!nextQuery) return;

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setHits([]);

    try {
      const trackId = parseDeezerTrackId(nextQuery);
      const nextHits = trackId
        ? [await resolveDeezerTrack(trackId, controller.signal)]
        : await searchDeezerTracks(nextQuery, 8, controller.signal);
      if (controller.signal.aborted) return;
      setHits(nextHits);
      if (nextHits.length === 0) {
        setSearchError("No Deezer tracks found. Try different keywords or paste a Deezer link below.");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setSearchError((err as Error).message || "Deezer search failed.");
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  };

  const handleSearch = (event: React.SyntheticEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const selectHit = (hit: DeezerTrackHit) => {
    if (!hit.previewUrl) {
      setSearchError("This Deezer track has no preview and cannot be played in a bingo game.");
      return;
    }
    setResolved(deezerHitToTrack(hit));
    setSelectedId(hit.id);
    setPasteError(null);
    setSearchError(null);
  };

  const resolvePaste = async () => {
    if (!pasteValue.trim()) return;
    resolveAbort.current?.abort();
    const controller = new AbortController();
    resolveAbort.current = controller;
    setIsResolving(true);
    setPasteError(null);
    try {
      const hit = await resolveDeezerTrack(pasteValue, controller.signal);
      if (controller.signal.aborted) return;
      if (!hit.previewUrl) {
        setResolved(null);
        setSelectedId(null);
        setPasteError("This Deezer track has no preview and cannot be played in a bingo game.");
        return;
      }
      setResolved(deezerHitToTrack(hit));
      setSelectedId(hit.id);
      setSearchError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setResolved(null);
      setSelectedId(null);
      setPasteError((err as Error).message || "That Deezer track could not be found.");
    } finally {
      if (!controller.signal.aborted) setIsResolving(false);
    }
  };

  const save = () => {
    if (!resolved) {
      setSearchError("Select a Deezer track before saving.");
      return;
    }
    onSave({
      ...track,
      album: resolved.album,
      albumArtUrl: resolved.albumArtUrl,
      durationMs: resolved.durationMs,
      media: resolved.media,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      matchStatus: resolved.media?.provider === "deezer" && resolved.media.previewUrl ? "manual" : "failed",
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <PcModal title="Manual Deezer track" onClose={onClose} className="max-w-2xl">
      <p className="text-sm font-semibold mb-1">{track.title}</p>
      <p className="text-sm mb-4">{track.artist}</p>

      {!isDeezerApiConfigured() ? (
        <p className="pc-bevel-inset p-3 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Deezer metadata is unavailable until the Worker is configured.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold mb-2">Find on Deezer</p>
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchError(null);
                  }}
                  placeholder="Artist, title…"
                  disabled={isSearching}
                  autoComplete="off"
                  className="pc-input w-full pl-8"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={isSearching || !searchQuery.trim()}
                className="shrink-0"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    Search
                  </>
                )}
              </Button>
            </form>

            {searchError && (
              <div className="flex items-center gap-2 text-xs pc-bevel-inset p-2 mb-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {hits.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold">
                  {hits.length} result{hits.length === 1 ? "" : "s"}
                  {isSearching ? " · searching…" : ""}
                </p>
                <div className="space-y-2 pc-bevel-inset p-2 max-h-56 overflow-y-auto">
                  {hits.map((hit) => {
                    const playable = Boolean(hit.previewUrl);
                    const isSelected = selectedId === hit.id;
                    return (
                      <div key={hit.id} className="flex items-center gap-3 p-2 pc-bevel-outset">
                        <img src={hit.albumArtUrl} alt="" className="w-14 h-14 object-cover shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{hit.title}</p>
                          <p className="text-[11px] truncate mt-0.5">
                            {hit.artist}
                            {hit.album ? ` · ${hit.album}` : ""}
                          </p>
                          <p
                            className={`text-[11px] mt-1 flex items-center gap-1 ${
                              playable ? "text-pc-success" : "text-pc-warning"
                            }`}
                          >
                            {playable ? <Volume2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {playable ? "Preview available" : "No preview available"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ClipPreviewButton track={hitToPreviewTrack(hit)} size="sm" showLabel />
                          <Button
                            type="button"
                            variant={isSelected ? undefined : "primary"}
                            disabled={!playable}
                            onClick={() => selectHit(hit)}
                            className="shrink-0 text-xs"
                          >
                            {isSelected ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Selected
                              </>
                            ) : playable ? (
                              "Select"
                            ) : (
                              "Unavailable"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--pc-border)]">
            <label className="block text-xs font-bold mb-1">Or paste a Deezer track URL or ID</label>
            <div className="flex gap-2">
              <Input
                className="flex-1 font-mono"
                value={pasteValue}
                onChange={(event) => {
                  setPasteValue(event.target.value);
                  setPasteError(null);
                }}
                placeholder="https://www.deezer.com/track/…"
              />
              <Button
                type="button"
                variant="primary"
                onClick={() => void resolvePaste()}
                disabled={isResolving || !pasteValue.trim()}
              >
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Resolve
              </Button>
            </div>
            {pasteError && (
              <p className="text-xs text-pc-error flex items-center gap-2 mt-2">
                <AlertCircle className="w-4 h-4" />
                {pasteError}
              </p>
            )}
            {resolved && selectedId && !hits.some((hit) => hit.id === selectedId) && (
              <div className="pc-bevel-inset p-2 flex items-center gap-3 mt-3">
                <img src={resolved.albumArtUrl} alt="" className="w-14 h-14 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{resolved.title}</p>
                  <p className="text-xs truncate">
                    {resolved.artist} · {resolved.album}
                  </p>
                  <p
                    className={`text-[11px] mt-1 flex items-center gap-1 ${
                      resolved.media?.provider === "deezer" && resolved.media.previewUrl
                        ? "text-pc-success"
                        : "text-pc-warning"
                    }`}
                  >
                    <Volume2 className="w-3 h-3" />
                    {resolved.media?.provider === "deezer" && resolved.media.previewUrl
                      ? "Preview available"
                      : "No preview available"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={!resolved} onClick={save}>
              <Check className="w-4 h-4" />
              Save track
            </Button>
          </div>
        </div>
      )}
    </PcModal>
  );
};
