import React, { useState, useEffect, useRef } from "react";
import { Button, Input } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { parseYoutubeVideoId, getYoutubeThumbnailUrl } from "../../lib/youtube/parseUrl";
import {
  checkHitsEmbeddability,
  checkVideoEmbeddable,
  EmbedValidationResult,
} from "../../lib/youtube/validator";
import {
  filterSearchHitsForDisplay,
  formatDuration,
  searchYoutubeVideos,
  YoutubeSearchHit,
} from "../../lib/youtube/search";
import { PcModal } from "../ui/PcModal";
import { Check, AlertCircle, ExternalLink, Loader2, AlertTriangle, Search } from "lucide-react";

interface ManualYoutubeModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

function defaultSearchQuery(track: Track): string {
  return `${track.artist} - ${track.title} official audio`;
}

export const ManualYoutubeModal: React.FC<ManualYoutubeModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const [inputValue, setInputValue] = useState(
    track.youtubeVideoId ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}` : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isCheckingAudio, setIsCheckingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState<EmbedValidationResult | null>(null);

  const [searchQuery, setSearchQuery] = useState(() => defaultSearchQuery(track));
  const [isSearching, setIsSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<YoutubeSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [embedStatuses, setEmbedStatuses] = useState<Map<string, EmbedValidationResult>>(new Map());
  const [isCheckingEmbeds, setIsCheckingEmbeds] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  const parsedId = parseYoutubeVideoId(inputValue);
  const thumbUrl = parsedId ? getYoutubeThumbnailUrl(parsedId, "hqdefault") : null;

  useEffect(() => {
    if (!isOpen) return;
    setInputValue(
      track.youtubeVideoId ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}` : ""
    );
    setError(null);
    setSearchQuery(defaultSearchQuery(track));
    setSearchHits([]);
    setSearchError(null);
    setEmbedStatuses(new Map());
  }, [isOpen, track]);

  useEffect(() => {
    return () => {
      searchAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !parsedId) {
      setAudioStatus(null);
      setIsCheckingAudio(false);
      return;
    }

    let isSubscribed = true;
    setIsCheckingAudio(true);
    setAudioStatus(null);

    const timer = setTimeout(async () => {
      try {
        const res = await checkVideoEmbeddable(parsedId);
        if (isSubscribed) {
          setAudioStatus(res);
        }
      } catch {
        // ignore check errors
      } finally {
        if (isSubscribed) {
          setIsCheckingAudio(false);
        }
      }
    }, 300);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [parsedId, isOpen]);

  useEffect(() => {
    if (searchHits.length === 0) {
      setEmbedStatuses(new Map());
      setIsCheckingEmbeds(false);
      return;
    }

    let cancelled = false;
    setIsCheckingEmbeds(true);

    void checkHitsEmbeddability(searchHits).then((results) => {
      if (!cancelled) {
        setEmbedStatuses(results);
        setIsCheckingEmbeds(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [searchHits]);

  if (!isOpen) return null;

  const getEmbedStatus = (videoId: string): EmbedValidationResult | null =>
    embedStatuses.get(videoId) ?? null;

  const { visible: visibleSearchHits, hiddenBlockedCount } = filterSearchHitsForDisplay(
    searchHits,
    getEmbedStatus,
    isCheckingEmbeds
  );

  const allSearchResultsBlocked =
    searchHits.length > 0 &&
    !isCheckingEmbeds &&
    searchHits.every((hit) => {
      const status = getEmbedStatus(hit.videoId);
      return status && !status.embeddable;
    });

  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(defaultSearchQuery(track))}`;

  const runYoutubeSearch = async () => {
    const nextQuery = searchQuery.trim();
    if (!nextQuery) return;

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    setIsSearching(true);
    setSearchError(null);
    setSearchHits([]);
    setEmbedStatuses(new Map());

    try {
      const hits = await searchYoutubeVideos(nextQuery, 8, controller.signal);
      if (controller.signal.aborted) return;
      setSearchHits(hits);
      if (hits.length === 0) {
        setSearchError("No matching videos found. Try different keywords or paste a YouTube link above.");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setSearchError((err as Error).message || "Search failed. Try again in a moment.");
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  };

  const handleYoutubeSearch = (e: React.SyntheticEvent) => {
    e.preventDefault();
    void runYoutubeSearch();
  };

  const handleSelectHit = (hit: YoutubeSearchHit) => {
    setInputValue(`https://www.youtube.com/watch?v=${hit.videoId}`);
    setError(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      onSave({
        ...track,
        youtubeVideoId: null,
        matchStatus: "pending",
      });
      onClose();
      return;
    }

    if (!parsedId) {
      setError("Please enter a valid YouTube URL or 11-character video ID.");
      return;
    }

    onSave({
      ...track,
      youtubeVideoId: parsedId,
      matchStatus: "manual",
    });
    onClose();
  };

  return (
    <PcModal
      title={`Manual YouTube Link — ${track.title}`}
      onClose={onClose}
      className="max-w-2xl"
    >
      <p className="text-sm mb-4">{track.artist}</p>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-bold mb-1">YouTube Video URL or Video ID</label>
          <div className="flex gap-2 items-center">
            <Input
              type="text"
              className="flex-1 min-w-0 font-mono"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            />
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pc-button shrink-0 inline-flex items-center gap-1.5"
              title="Opens YouTube in a new tab"
              aria-label="Open on YouTube in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open on YouTube
            </a>
          </div>
          <p className="text-[11px] mt-1 opacity-75">Paste a link directly, or open YouTube in a new tab to browse manually.</p>
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </p>
        )}
        {parsedId && thumbUrl && (
          <div className="p-2 pc-bevel-inset flex items-start gap-3">
            <img src={thumbUrl} alt="YouTube Preview" className="w-24 h-16 object-cover shrink-0 pc-bevel-inset" />
            <div className="text-xs space-y-1">
              <span className="inline-flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" />
                Valid Video ID ({parsedId})
              </span>

              {isCheckingAudio && (
                <p className="flex items-center gap-1.5 text-xs opacity-75">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Testing video playback...</span>
                </p>
              )}

              {audioStatus && audioStatus.embeddable && (
                <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Audio verified (playable in game)</span>
                </p>
              )}

              {audioStatus && !audioStatus.embeddable && (
                <div className="text-pc-warning">
                  <p className="flex items-center gap-1 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Playback restricted by owner</span>
                  </p>
                  <p className="text-[11px] mt-0.5">
                    The video owner has restricted playback outside YouTube. We recommend searching for an official audio or lyric video instead.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--pc-border)]">
          <p className="text-xs font-bold mb-2">Find clips here</p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError(null);
                }}
                placeholder="Artist, title, official audio…"
                disabled={isSearching}
                autoComplete="off"
                className="pc-input w-full pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleYoutubeSearch(e);
                }}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={isSearching || !searchQuery.trim()}
              className="shrink-0"
              onClick={handleYoutubeSearch}
              aria-label="Find clips on this page"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Finding clips…
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Find clips
                </>
              )}
            </Button>
          </div>

          {searchError && (
            <div className="flex items-center gap-2 text-xs pc-bevel-inset p-2 mb-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {searchHits.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold">
                {visibleSearchHits.length} result{visibleSearchHits.length === 1 ? "" : "s"}
                {isCheckingEmbeds ? " · checking embeds…" : ""}
                {hiddenBlockedCount > 0
                  ? ` · ${hiddenBlockedCount} blocked hidden`
                  : ""}
              </p>
              {allSearchResultsBlocked && (
                <p className="text-xs pc-bevel-inset p-2">
                  None of these results allow in-game playback. Try different keywords like &quot;official audio&quot;, or paste a YouTube link above.
                </p>
              )}
              <div className="space-y-2 pc-bevel-inset p-2 max-h-56 overflow-y-auto">
                {visibleSearchHits.map((hit) => {
                  const embedStatus = embedStatuses.get(hit.videoId);
                  const isBlocked = embedStatus ? !embedStatus.embeddable : false;
                  const isCheckingThis = isCheckingEmbeds && !embedStatus;
                  const isSelected = parsedId === hit.videoId;

                  return (
                    <div
                      key={hit.videoId}
                      className={`flex items-center gap-3 p-2 pc-bevel-outset ${isBlocked ? "opacity-80" : ""}`}
                    >
                      <img
                        src={hit.thumbnailUrl}
                        alt=""
                        className="w-20 h-12 object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{hit.title}</p>
                        <p className="text-[11px] truncate mt-0.5">
                          {hit.author}
                          {hit.lengthSeconds > 0 ? ` · ${formatDuration(hit.lengthSeconds)}` : ""}
                        </p>
                        {isCheckingThis && (
                          <p className="text-[11px] mt-1 flex items-center gap-1 opacity-75">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Checking embed permission…
                          </p>
                        )}
                        {embedStatus?.embeddable && (
                          <p className="text-[11px] mt-1 text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Playable in game
                          </p>
                        )}
                        {isBlocked && (
                          <p className="text-[11px] mt-1 text-pc-warning flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Embedding blocked
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={isSelected ? undefined : "primary"}
                        disabled={isBlocked || isCheckingThis}
                        onClick={() => handleSelectHit(hit)}
                        className="shrink-0 text-xs"
                        title={isBlocked ? embedStatus?.reason || "This video cannot be embedded in the game" : undefined}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Selected
                          </>
                        ) : isBlocked ? (
                          "Blocked"
                        ) : (
                          "Select"
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save Track
          </Button>
        </div>
      </form>
    </PcModal>
  );
};
