import React, { useEffect, useRef, useState } from "react";
import { Track } from "../../types/deck";
import {
  YoutubeSearchHit,
  resolveYoutubeQuery,
  searchYoutubeVideos,
  hitToTrack,
  formatDuration,
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
}

function looksLikeYoutubeInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return true;
  return Boolean(parseYoutubeVideoId(trimmed) || parseYoutubePlaylistId(trimmed));
}

export const SongSearch: React.FC<SongSearchProps> = ({
  existingVideoIds = [],
  onAddTrack,
  onAddTracks,
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
  const blurTimer = useRef<number | null>(null);
  const skipCatalogQuery = useRef<string | null>(null);
  const youtubeAbort = useRef<AbortController | null>(null);
  const suggestionListRef = useRef<HTMLDivElement | null>(null);
  const usingKeyboardNav = useRef(false);

  const alreadyInDeck = new Set(
    existingVideoIds.filter((id): id is string => Boolean(id))
  );

  const visibleSuggestions = filterCatalogSongs(suggestions, query);
  const highlightedIndexRef = useRef(-1);
  highlightedIndexRef.current = highlightedIndex;

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

  const runYoutubeSearch = async (nextQuery: string, catalog?: CatalogSong | null) => {
    youtubeAbort.current?.abort();
    const controller = new AbortController();
    youtubeAbort.current = controller;

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
    } finally {
      setAddingVideoId(null);
    }
  };

  const addAllVisible = async () => {
    const fresh = hits.filter(
      (hit) => !alreadyInDeck.has(hit.videoId) && !addedIds.has(hit.videoId)
    );
    if (fresh.length === 0) return;

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
      }
    } finally {
      setIsCheckingEmbeds(false);
    }
  };

  const resultLabel =
    kind === "playlist"
      ? playlistName
        ? `Playlist: ${playlistName}`
        : "Playlist videos"
      : kind === "video"
        ? "This video"
        : kind === "search"
          ? selectedCatalog
            ? `YouTube clips for ${selectedCatalog.artist} — ${selectedCatalog.title}`
            : "Best matches"
          : null;

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && visibleSuggestions.length > 0}
            aria-controls="song-suggestion-list"
            aria-activedescendant={
              highlightedIndex >= 0 ? `song-suggestion-${highlightedIndex}` : undefined
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCatalog(null);
              setError(null);
              setShowSuggestions(true);
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

          {showSuggestions && (visibleSuggestions.length > 0 || isCatalogLoading) && (
            <div
              id="song-suggestion-list"
              ref={suggestionListRef}
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-1 pc-window max-h-64 overflow-y-auto"
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
          )}
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="pc-button pc-button--primary shrink-0"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Search YouTube
            </>
          )}
        </button>
      </form>

      <p className="text-xs">
        Type a song or artist, pick a match if you want, then search YouTube. Results are checked for embeddable playback before you add them.
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
              {resultLabel} · {hits.length} result{hits.length === 1 ? "" : "s"}
              {isCheckingEmbeds ? " · checking embeds…" : ""}
            </p>
            {hits.length > 1 && (
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

          <div className="space-y-2 pc-bevel-inset p-2">
            {hits.map((hit) => {
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
                      <p className="text-[11px] mt-1 text-amber-600 dark:text-amber-400 flex items-center gap-1">
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
