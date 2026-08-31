import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Track } from "../../types/deck";
import {
  YoutubeSearchHit,
  resolveYoutubeQuery,
  searchYoutubeVideos,
  hitToTrack,
  formatDuration,
  filterSearchHitsForDisplay,
  ResolveKind,
} from "../../lib/youtube/search";
import { CatalogSong, catalogYoutubeQuery, filterCatalogSongs, searchCatalogSongs } from "../../lib/music/catalog";
import { parseYoutubePlaylistId, parseYoutubeVideoId } from "../../lib/youtube/parseUrl";
import {
  checkHitsEmbeddability,
  checkVideoEmbeddable,
  EmbedValidationResult,
  getCachedEmbedStatus,
} from "../../lib/youtube/validator";
import { AlertCircle, Check, Loader2, Plus, Search, AlertTriangle } from "lucide-react";

interface SongSearchProps {
  existingVideoIds?: Array<string | null | undefined>;
  onAddTrack: (track: Track) => void;
  onAddTracks?: (tracks: Track[]) => void;
  onAfterAdd?: () => void;
}

const VIEWPORT_MARGIN = 8;
const SUGGESTION_GAP = 4;
const SUGGESTION_MAX_HEIGHT = 256;
const SUGGESTION_MIN_HEIGHT = 80;
/** Above modal overlay (--pc-overlay-z: 1000) so portaled suggestions stay clickable. */
const SUGGESTION_Z_INDEX = 1050;

function computeSuggestionPosition(anchorRect: DOMRect): {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
} {
  const width = anchorRect.width;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchorRect.left, window.innerWidth - width - VIEWPORT_MARGIN),
  );

  const spaceBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = anchorRect.top - VIEWPORT_MARGIN;

  const openDown =
    spaceBelow >= SUGGESTION_MIN_HEIGHT || spaceBelow >= spaceAbove;

  if (openDown) {
    const maxHeight = Math.min(
      SUGGESTION_MAX_HEIGHT,
      Math.max(spaceBelow - SUGGESTION_GAP, SUGGESTION_MIN_HEIGHT),
    );
    return {
      top: anchorRect.bottom + SUGGESTION_GAP,
      left,
      width,
      maxHeight,
    };
  }

  const maxHeight = Math.min(
    SUGGESTION_MAX_HEIGHT,
    Math.max(spaceAbove - SUGGESTION_GAP, SUGGESTION_MIN_HEIGHT),
  );
  return {
    top: Math.max(VIEWPORT_MARGIN, anchorRect.top - maxHeight - SUGGESTION_GAP),
    left,
    width,
    maxHeight,
  };
}

function looksLikeYoutubeInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return true;
  return Boolean(parseYoutubeVideoId(trimmed) || parseYoutubePlaylistId(trimmed));
}

function queryHasLyricsSuffix(query: string): boolean {
  return /\blyrics?\b/i.test(query.trim());
}

function withLyricsSuffix(query: string): string {
  const trimmed = query.trim();
  if (!trimmed || queryHasLyricsSuffix(trimmed)) return trimmed;
  return `${trimmed} lyrics`;
}

export const SongSearch: React.FC<SongSearchProps> = ({
  existingVideoIds = [],
  onAddTrack,
  onAddTracks,
  onAfterAdd,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ResolveKind | null>(null);
  const [hits, setHits] = useState<YoutubeSearchHit[]>([]);
  const [playlistName, setPlaylistName] = useState<string | undefined>();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<CatalogSong[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSong | null>(null);
  const [embedStatuses, setEmbedStatuses] = useState<Map<string, EmbedValidationResult>>(new Map());
  const [isCheckingEmbeds, setIsCheckingEmbeds] = useState(false);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [lyricsFallbackUsed, setLyricsFallbackUsed] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const skipCatalogQuery = useRef<string | null>(null);
  const youtubeAbort = useRef<AbortController | null>(null);
  const lastYoutubeSearchQueryRef = useRef("");
  const lyricsFallbackAttemptedRef = useRef(false);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const usingKeyboardNav = useRef(false);
  const [suggestionPosition, setSuggestionPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const alreadyInDeck = new Set(
    existingVideoIds.filter((id): id is string => Boolean(id))
  );

  const visibleSuggestions = filterCatalogSongs(suggestions, query);
  const suggestionsOpen = showSuggestions && (visibleSuggestions.length > 0 || isCatalogLoading);
  const highlightedIndexRef = useRef(-1);
  highlightedIndexRef.current = highlightedIndex;

  useLayoutEffect(() => {
    if (!suggestionsOpen || !inputContainerRef.current) {
      setSuggestionPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!inputContainerRef.current) return;
      const anchorRect = inputContainerRef.current.getBoundingClientRect();
      setSuggestionPosition(computeSuggestionPosition(anchorRect));
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [suggestionsOpen, visibleSuggestions.length, isCatalogLoading]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  useEffect(() => {
    if (hits.length === 0) {
      setEmbedStatuses(new Map());
      setIsCheckingEmbeds(false);
      return;
    }

    let cancelled = false;
    setIsCheckingEmbeds(true);

    void checkHitsEmbeddability(hits).then((results) => {
      if (!cancelled) {
        setEmbedStatuses(results);
        setIsCheckingEmbeds(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hits]);

  useEffect(() => {
    if (isCheckingEmbeds || isSearching || hits.length === 0) return;
    if (lyricsFallbackAttemptedRef.current) return;
    if (kind !== "search") return;

    const baseQuery = lastYoutubeSearchQueryRef.current;
    if (!baseQuery || queryHasLyricsSuffix(baseQuery)) return;

    const allBlocked = hits.every((hit) => {
      const status = embedStatuses.get(hit.videoId);
      return status && !status.embeddable;
    });
    if (!allBlocked) return;

    void runLyricsFallbackSearch(baseQuery);
  }, [hits, embedStatuses, isCheckingEmbeds, isSearching, kind]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    const option = suggestionListRef.current?.querySelector<HTMLElement>(
      `[data-suggestion-index="${highlightedIndex}"]`
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  useEffect(() => {
    const nextQuery = query.trim();
    if (skipCatalogQuery.current && nextQuery === skipCatalogQuery.current) {
      return;
    }
    skipCatalogQuery.current = null;

    if (nextQuery.length < 2 || looksLikeYoutubeInput(nextQuery)) {
      setSuggestions([]);
      setIsCatalogLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsCatalogLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const songs = await searchCatalogSongs(nextQuery, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(songs);
          setShowSuggestions(true);
        }
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsCatalogLoading(false);
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const runYoutubeSearch = async (
    nextQuery: string,
    catalog?: CatalogSong | null,
    options?: { isLyricsFallback?: boolean }
  ) => {
    youtubeAbort.current?.abort();
    const controller = new AbortController();
    youtubeAbort.current = controller;

    if (!options?.isLyricsFallback) {
      lyricsFallbackAttemptedRef.current = false;
      setLyricsFallbackUsed(false);
      lastYoutubeSearchQueryRef.current = (catalog ? catalogYoutubeQuery(catalog) : nextQuery).trim();
    }

    setIsSearching(true);
    setError(null);
    setHits([]);
    setKind(null);
    setPlaylistName(undefined);
    setShowSuggestions(false);
    setEmbedStatuses(new Map());

    try {
      if (catalog) {
        const ytHits = await searchYoutubeVideos(catalogYoutubeQuery(catalog), 8, controller.signal);
        if (controller.signal.aborted) return;
        setKind("search");
        setHits(ytHits);
        if (ytHits.length === 0) {
          setError(`No YouTube clips found for ${catalog.artist} — ${catalog.title}. Try another match or paste a YouTube link.`);
        }
        return;
      }

      const result = await resolveYoutubeQuery(nextQuery, controller.signal);
      if (controller.signal.aborted) return;
      setKind(result.kind);
      setHits(result.hits);
      setPlaylistName(result.playlistName);
      if (result.hits.length === 0) {
        setError("No matching videos found. Try a song name like “Queen Bohemian Rhapsody”, or paste a YouTube link.");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message || "Search failed. Try again in a moment.");
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  };

  const runLyricsFallbackSearch = async (baseQuery: string) => {
    const lyricsQuery = withLyricsSuffix(baseQuery);
    if (!lyricsQuery || lyricsQuery === baseQuery) return;

    lyricsFallbackAttemptedRef.current = true;
    setLyricsFallbackUsed(true);
    // Search by lyrics query directly; keep selectedCatalog in state for track metadata.
    await runYoutubeSearch(lyricsQuery, null, { isLyricsFallback: true });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;
    skipCatalogQuery.current = nextQuery;
    setSelectedCatalog(null);
    await runYoutubeSearch(nextQuery);
  };

  const handlePickCatalogSong = async (song: CatalogSong) => {
    const nextQuery = `${song.artist} - ${song.title}`;
    skipCatalogQuery.current = nextQuery;
    setQuery(nextQuery);
    setSelectedCatalog(song);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    await runYoutubeSearch(catalogYoutubeQuery(song), song);
  };

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestionOpen = showSuggestions && visibleSuggestions.length > 0;
    if (e.key === "ArrowDown") {
      if (visibleSuggestions.length === 0) return;
      e.preventDefault();
      clearBlurTimer();
      usingKeyboardNav.current = true;
      setShowSuggestions(true);
      setHighlightedIndex((index) => Math.min(index + 1, visibleSuggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (!suggestionOpen) return;
      e.preventDefault();
      clearBlurTimer();
      usingKeyboardNav.current = true;
      setHighlightedIndex((index) => Math.max(index - 1, -1));
      return;
    }
    if (e.key === "Escape") {
      if (!showSuggestions) return;
      e.preventDefault();
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === "Enter" && suggestionOpen && highlightedIndexRef.current >= 0) {
      const song = visibleSuggestions[highlightedIndexRef.current];
      if (!song) return;
      e.preventDefault();
      void handlePickCatalogSong(song);
    }
  };

  const getEmbedStatus = (videoId: string): EmbedValidationResult | null => {
    return embedStatuses.get(videoId) ?? getCachedEmbedStatus(videoId);
  };

  const addHit = async (hit: YoutubeSearchHit) => {
    if (alreadyInDeck.has(hit.videoId) || addedIds.has(hit.videoId)) return;

    setAddingVideoId(hit.videoId);
    setError(null);
    try {
      const status = getEmbedStatus(hit.videoId) ?? (await checkVideoEmbeddable(hit.videoId));
      setEmbedStatuses((prev) => new Map(prev).set(hit.videoId, status));

      if (!status.embeddable) {
        setError(
          `"${hit.title}" blocks embedding on YouTube. Pick a result marked Playable, or try an official audio / lyric video.`
        );
        return;
      }

      onAddTrack(hitToTrack(hit, selectedCatalog ?? undefined));
      setAddedIds((prev) => new Set(prev).add(hit.videoId));
      setHits([]);
      setKind(null);
      setQuery("");
      setSelectedCatalog(null);
      onAfterAdd?.();
    } finally {
      setAddingVideoId(null);
    }
  };

  const addAllVisible = async () => {
    const fresh = hits.filter(
      (hit) => !alreadyInDeck.has(hit.videoId) && !addedIds.has(hit.videoId)
    );
    if (fresh.length === 0) return;

    if (!selectedCatalog) {
      const ok = window.confirm(
        "These results may not match your search. Add all playable videos anyway?"
      );
      if (!ok) return;
    }

    setIsCheckingEmbeds(true);
    setError(null);
    try {
      const statuses = await checkHitsEmbeddability(fresh);
      setEmbedStatuses((prev) => {
        const next = new Map(prev);
        statuses.forEach((value, key) => next.set(key, value));
        return next;
      });

      const playable = fresh.filter((hit) => statuses.get(hit.videoId)?.embeddable);
      const blocked = fresh.length - playable.length;

      if (playable.length === 0) {
        setError("None of the visible results allow embedding. Try searching for official audio versions.");
        return;
      }

      const tracks = playable.map((hit) => hitToTrack(hit, selectedCatalog ?? undefined));
      if (onAddTracks) {
        onAddTracks(tracks);
      } else {
        tracks.forEach(onAddTrack);
      }
      setAddedIds((prev) => {
        const next = new Set(prev);
        playable.forEach((hit) => next.add(hit.videoId));
        return next;
      });

      if (blocked > 0) {
        setError(`Added ${playable.length} playable video${playable.length === 1 ? "" : "s"}. Skipped ${blocked} with embedding disabled.`);
      } else {
        setHits([]);
        setKind(null);
        setQuery("");
        setSelectedCatalog(null);
        onAfterAdd?.();
      }
    } finally {
      setIsCheckingEmbeds(false);
    }
  };

  const { visible: visibleHits, hiddenBlockedCount } = filterSearchHitsForDisplay(
    hits,
    getEmbedStatus,
    isCheckingEmbeds
  );

  const allResultsBlocked =
    hits.length > 0 &&
    !isCheckingEmbeds &&
    hits.every((hit) => {
      const status = getEmbedStatus(hit.videoId);
      return status && !status.embeddable;
    });

  const resultLabel =
    kind === "playlist"
      ? playlistName
        ? `Playlist: ${playlistName}`
        : "Playlist videos"
      : kind === "video"
        ? "This video"
        : kind === "search"
          ? selectedCatalog
            ? lyricsFallbackUsed
              ? `YouTube clips for ${selectedCatalog.artist} — ${selectedCatalog.title} (lyric videos)`
              : `YouTube clips for ${selectedCatalog.artist} — ${selectedCatalog.title}`
            : lyricsFallbackUsed
              ? "Lyric video matches"
              : "Best matches"
          : null;

  const suggestionPanel = suggestionsOpen ? (
    <div
      id="song-suggestion-list"
      ref={suggestionListRef}
      role="listbox"
      className="pc-window overflow-y-auto"
      style={{
        position: "fixed",
        top: suggestionPosition?.top ?? -9999,
        left: suggestionPosition?.left ?? -9999,
        width: suggestionPosition?.width,
        maxHeight: suggestionPosition?.maxHeight,
        zIndex: SUGGESTION_Z_INDEX,
        visibility: suggestionPosition ? "visible" : "hidden",
      }}
    >
      {isCatalogLoading && visibleSuggestions.length === 0 && (
        <div className="px-3 py-2 text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Looking up songs…
        </div>
      )}
      {visibleSuggestions.map((song, index) => {
        const active = index === highlightedIndex;
        return (
          <button
            key={song.id}
            id={`song-suggestion-${index}`}
            data-suggestion-index={index}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => {
              usingKeyboardNav.current = false;
            }}
            onMouseEnter={() => {
              if (!usingKeyboardNav.current) setHighlightedIndex(index);
            }}
            onClick={() => handlePickCatalogSong(song)}
            className={`w-full px-3 py-2 text-left ${
              active ? "bg-[var(--pc-titlebar-bg)] text-white" : "hover:bg-[var(--pc-titlebar-bg)] hover:text-white"
            }`}
          >
            <p className="text-sm font-semibold truncate">{song.title}</p>
            <p className="text-xs truncate">
              {song.artist}
              {song.album ? ` · ${song.album}` : ""}
            </p>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSearch}
        className={`flex gap-2 ${suggestionsOpen ? "flex-col" : "flex-col sm:flex-row"}`}
      >
        <div ref={inputContainerRef} className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls="song-suggestion-list"
            aria-activedescendant={
              highlightedIndex >= 0 ? `song-suggestion-${highlightedIndex}` : undefined
            }
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setSelectedCatalog(null);
              setError(null);
              setShowSuggestions(true);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").trim();
              if (!looksLikeYoutubeInput(pasted)) return;
              e.preventDefault();
              setQuery(pasted);
              setSelectedCatalog(null);
              setError(null);
              setShowSuggestions(false);
              skipCatalogQuery.current = pasted;
              void runYoutubeSearch(pasted);
            }}
            onKeyDown={handleQueryKeyDown}
            onFocus={() => {
              clearBlurTimer();
              if (visibleSuggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder="Song or artist… or paste a YouTube link"
            disabled={isSearching}
            autoComplete="off"
            className="pc-input w-full pl-8"
          />

          {suggestionPanel && createPortal(suggestionPanel, document.body)}
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="pc-button pc-button--primary shrink-0"
          aria-label="Find clips on this page"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finding clips…
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Find clips
            </>
          )}
        </button>
      </form>

      <p className="text-xs">
        Search a song or artist, or paste a YouTube link.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-xs pc-bevel-inset p-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {hits.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold">
              {resultLabel} · {visibleHits.length} result{visibleHits.length === 1 ? "" : "s"}
              {isCheckingEmbeds ? " · checking embeds…" : ""}
              {hiddenBlockedCount > 0
                ? ` · ${hiddenBlockedCount} blocked hidden`
                : ""}
            </p>
            {visibleHits.length > 1 && (
              <button
                type="button"
                onClick={() => void addAllVisible()}
                disabled={isCheckingEmbeds || addingVideoId !== null}
                className="pc-link text-xs bg-transparent border-0"
              >
                Add all playable
              </button>
            )}
          </div>

          {allResultsBlocked && !isSearching && (
            <p className="text-xs pc-bevel-inset p-2">
              {lyricsFallbackUsed
                ? "None of these lyric videos allow in-game playback. Try pasting a different YouTube link."
                : "None of these results allow in-game playback. Try searching for an official audio or lyric video, or paste a different YouTube link."}
            </p>
          )}

          {isSearching && lyricsFallbackUsed && hits.length === 0 && (
            <p className="text-xs pc-bevel-inset p-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Trying lyric video search…
            </p>
          )}

          <div className="space-y-2 pc-bevel-inset p-2">
            {visibleHits.map((hit) => {
              const added = alreadyInDeck.has(hit.videoId) || addedIds.has(hit.videoId);
              const embedStatus = getEmbedStatus(hit.videoId);
              const isBlocked = embedStatus ? !embedStatus.embeddable : false;
              const isCheckingThis = isCheckingEmbeds && !embedStatus;
              const isAddingThis = addingVideoId === hit.videoId;

              return (
                <div
                  key={hit.videoId}
                  className={`flex items-center gap-3 p-2 pc-bevel-outset ${isBlocked ? "opacity-80" : ""}`}
                >
                  <img
                    src={hit.thumbnailUrl}
                    alt=""
                    className="w-24 h-14 object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{hit.title}</p>
                    <p className="text-xs truncate mt-0.5">
                      {hit.author}
                      {hit.lengthSeconds > 0 ? ` · ${formatDuration(hit.lengthSeconds)}` : ""}
                    </p>
                    {isCheckingThis && (
                      <p className="text-[11px] mt-1 flex items-center gap-1 text-muted">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Checking embed permission…
                      </p>
                    )}
                    {embedStatus?.embeddable && (
                      <p className="text-[11px] mt-1 text-pc-success flex items-center gap-1">
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
                  <button
                    type="button"
                    disabled={added || isBlocked || isAddingThis || isCheckingThis}
                    onClick={() => void addHit(hit)}
                    className={`pc-button shrink-0 text-xs ${added ? "active" : isBlocked ? "" : "pc-button--primary"}`}
                    title={
                      isBlocked
                        ? embedStatus?.reason || "This video cannot be embedded in the game"
                        : undefined
                    }
                  >
                    {isAddingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : added ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {added ? "Added" : isBlocked ? "Blocked" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
