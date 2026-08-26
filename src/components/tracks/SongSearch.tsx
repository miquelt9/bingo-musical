import React, { useState } from "react";
import { Track } from "../../types/deck";
import {
  YoutubeSearchHit,
  resolveYoutubeQuery,
  hitToTrack,
  formatDuration,
  ResolveKind,
} from "../../lib/youtube/search";
import { AlertCircle, Check, Loader2, Plus, Search } from "lucide-react";

interface SongSearchProps {
  existingVideoIds?: Array<string | null | undefined>;
  onAddTrack: (track: Track) => void;
  onAddTracks?: (tracks: Track[]) => void;
}

export const SongSearch: React.FC<SongSearchProps> = ({
  existingVideoIds = [],
  onAddTrack,
  onAddTracks,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ResolveKind | null>(null);
  const [hits, setHits] = useState<YoutubeSearchHit[]>([]);
  const [playlistName, setPlaylistName] = useState<string | undefined>();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const alreadyInDeck = new Set(
    existingVideoIds.filter((id): id is string => Boolean(id))
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) return;

    setIsSearching(true);
    setError(null);
    setHits([]);
    setKind(null);
    setPlaylistName(undefined);

    try {
      const result = await resolveYoutubeQuery(nextQuery);
      setKind(result.kind);
      setHits(result.hits);
      setPlaylistName(result.playlistName);
      if (result.hits.length === 0) {
        setError("No matching videos found. Try a song name like “Queen Bohemian Rhapsody”.");
      }
    } catch (err) {
      setError((err as Error).message || "Search failed. Try again in a moment.");
    } finally {
      setIsSearching(false);
    }
  };

  const addHit = (hit: YoutubeSearchHit) => {
    onAddTrack(hitToTrack(hit));
    setAddedIds((prev) => new Set(prev).add(hit.videoId));
  };

  const addAllVisible = () => {
    const fresh = hits.filter(
      (hit) => !alreadyInDeck.has(hit.videoId) && !addedIds.has(hit.videoId)
    );
    if (fresh.length === 0) return;
    const tracks = fresh.map(hitToTrack);
    if (onAddTracks) {
      onAddTracks(tracks);
    } else {
      tracks.forEach(onAddTrack);
    }
    setAddedIds((prev) => {
      const next = new Set(prev);
      fresh.forEach((hit) => next.add(hit.videoId));
      return next;
    });
  };

  const resultLabel =
    kind === "playlist"
      ? playlistName
        ? `Playlist: ${playlistName}`
        : "Playlist videos"
      : kind === "video"
        ? "This video"
        : kind === "search"
          ? "Best matches"
          : null;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            placeholder="Song name or YouTube link… e.g. Queen Bohemian Rhapsody"
            disabled={isSearching}
            className="w-full pl-11 pr-5 py-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-white placeholder-zinc-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all inline-flex items-center justify-center gap-2 shrink-0 active:scale-95"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Search
            </>
          )}
        </button>
      </form>

      <p className="text-xs text-zinc-500">
        Paste a YouTube video, a playlist link, or type a song name. Pick the match you want.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-3 rounded-xl border border-red-500/30">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {hits.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {resultLabel} · {hits.length} result{hits.length === 1 ? "" : "s"}
            </p>
            {hits.length > 1 && (
              <button
                type="button"
                onClick={addAllVisible}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Add all
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {hits.map((hit) => {
              const added = alreadyInDeck.has(hit.videoId) || addedIds.has(hit.videoId);
              return (
                <div
                  key={hit.videoId}
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700"
                >
                  <img
                    src={hit.thumbnailUrl}
                    alt=""
                    className="w-24 h-14 rounded-xl object-cover bg-zinc-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{hit.title}</p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {hit.author}
                      {hit.lengthSeconds > 0 ? ` · ${formatDuration(hit.lengthSeconds)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => addHit(hit)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      added
                        ? "bg-zinc-800 text-emerald-400 border border-emerald-500/20"
                        : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                    }`}
                  >
                    {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {added ? "Added" : "Add"}
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
