import React, { useState } from "react";
import { Track } from "../../types/deck";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { ManualYoutubeModal } from "./ManualYoutubeModal";
import {
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
} from "../../lib/youtube/parseUrl";
import {
  Search,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  Music2,
  PlaySquare,
} from "lucide-react";

interface TrackTableProps {
  tracks: Track[];
  onUpdateTrack: (updatedTrack: Track) => void;
  onDeleteTrack?: (trackId: string) => void;
  onAutoMatchAll?: () => void;
  isMatching?: boolean;
  matchProgress?: { total: number; completed: number; matched: number; failed: number } | null;
}

export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  onUpdateTrack,
  onDeleteTrack,
  onAutoMatchAll,
  isMatching = false,
  matchProgress = null,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  // Filtered list
  const filteredTracks = tracks.filter((track) => {
    const matchesSearch =
      track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (track.album && track.album.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "matched") {
      return track.matchStatus === "matched" || track.matchStatus === "manual";
    }
    if (statusFilter === "unmatched") {
      return track.matchStatus === "pending" || track.matchStatus === "failed";
    }
    return true;
  });

  const matchedCount = tracks.filter((t) => t.matchStatus === "matched" || t.matchStatus === "manual").length;
  const unmatchedCount = tracks.length - matchedCount;

  const handleTimeChange = (track: Track, field: "startTime" | "endTime", valueStr: string) => {
    const num = parseInt(valueStr, 10);
    if (isNaN(num) || num < 0) return;

    if (field === "startTime") {
      const newEnd = Math.max(num + 5, track.endTime);
      onUpdateTrack({
        ...track,
        startTime: num,
        endTime: newEnd,
      });
    } else {
      const newEnd = Math.max(track.startTime + 5, num);
      onUpdateTrack({
        ...track,
        endTime: newEnd,
      });
    }
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
      {/* Search & Actions Header */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-6">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search Bar */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter tracks by title, artist, or album..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-zinc-800 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All ({tracks.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("matched")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "matched"
                  ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Matched ({matchedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("unmatched")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === "unmatched"
                  ? "bg-amber-500/20 text-amber-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Unmatched ({unmatchedCount})
            </button>
          </div>
        </div>

        {/* Action button: Auto Match */}
        {onAutoMatchAll && (
          <button
            type="button"
            onClick={onAutoMatchAll}
            disabled={isMatching || unmatchedCount === 0}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 ${
              isMatching
                ? "bg-zinc-800 text-zinc-400 cursor-wait border border-zinc-700"
                : unmatchedCount === 0
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
                : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20"
            }`}
          >
            <Sparkles className={`w-4 h-4 ${isMatching ? "animate-spin text-emerald-400" : ""}`} />
            <span>
              {isMatching
                ? `Matching (${matchProgress?.completed || 0}/${matchProgress?.total || tracks.length})...`
                : "Auto-Match All on YouTube"}
            </span>
          </button>
        )}
      </div>

      {/* Matching Progress Bar if Active */}
      {isMatching && matchProgress && (
        <div className="mb-6 p-4 rounded-2xl bg-zinc-950/70 border border-emerald-500/30 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-xs text-zinc-300 mb-2 font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              <span>Matching songs with YouTube public instance pool...</span>
            </span>
            <span className="font-mono text-emerald-400">
              {matchProgress.completed} / {matchProgress.total} ({Math.round((matchProgress.completed / matchProgress.total) * 100)}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-200"
              style={{ width: `${(matchProgress.completed / matchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Tracks Table */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-950/40">
        <table className="w-full text-left text-sm text-zinc-300 border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider bg-zinc-900/40">
              <th className="py-3.5 pl-4 pr-2 w-12 text-center">#</th>
              <th className="py-3.5 px-3">Song & Artist</th>
              <th className="py-3.5 px-3 w-32">Match Status</th>
              <th className="py-3.5 px-3 w-40">YouTube Video</th>
              <th className="py-3.5 px-3 w-48 text-center">Snippet Timestamps</th>
              <th className="py-3.5 px-3 w-36 text-center">Preview</th>
              <th className="py-3.5 pr-4 pl-2 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-normal">
            {filteredTracks.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  <Music2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-sm">No tracks found matching your filter.</p>
                </td>
              </tr>
            ) : (
              filteredTracks.map((track, idx) => {
                const thumb = track.albumArtUrl || (track.youtubeVideoId ? getYoutubeThumbnailUrl(track.youtubeVideoId, "mqdefault") : null);

                return (
                  <tr
                    key={track.id}
                    className="hover:bg-zinc-800/30 transition-colors group"
                  >
                    {/* # Index */}
                    <td className="py-3 pl-4 pr-2 text-center font-mono text-xs text-zinc-500">
                      {idx + 1}
                    </td>

                    {/* Song & Artist */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-zinc-700 shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center text-zinc-500">
                            <Music2 className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate max-w-[260px] sm:max-w-xs">
                            {track.title}
                          </p>
                          <p className="text-xs text-zinc-400 truncate max-w-[260px] sm:max-w-xs">
                            {track.artist}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Match Status Badge */}
                    <td className="py-3 px-3">
                      {track.matchStatus === "matched" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Matched</span>
                        </span>
                      ) : track.matchStatus === "manual" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <PlaySquare className="w-3 h-3" />
                          <span>Manual</span>
                        </span>
                      ) : track.matchStatus === "failed" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                          <AlertCircle className="w-3 h-3" />
                          <span>Unmatched</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* YouTube Video link / preview */}
                    <td className="py-3 px-3">
                      {track.youtubeVideoId ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={getYoutubeWatchUrl(track.youtubeVideoId, track.startTime)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white font-mono hover:underline truncate max-w-[120px]"
                            title="Open video on YouTube"
                          >
                            <span>{track.youtubeVideoId}</span>
                            <ExternalLink className="w-3 h-3 text-zinc-500" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500 italic">No video linked</span>
                      )}
                    </td>

                    {/* Snippet Timestamps Start - End */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase">Start</span>
                          <input
                            type="number"
                            min="0"
                            value={track.startTime}
                            onChange={(e) => handleTimeChange(track, "startTime", e.target.value)}
                            className="w-14 px-1.5 py-1 text-center font-mono text-xs rounded-lg bg-zinc-950 border border-zinc-700 focus:border-emerald-500 outline-none text-white"
                          />
                          <span className="text-xs text-zinc-500 font-mono">s</span>
                        </div>

                        <span className="text-zinc-600 font-mono">-</span>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase">End</span>
                          <input
                            type="number"
                            min={track.startTime + 1}
                            value={track.endTime}
                            onChange={(e) => handleTimeChange(track, "endTime", e.target.value)}
                            className="w-14 px-1.5 py-1 text-center font-mono text-xs rounded-lg bg-zinc-950 border border-zinc-700 focus:border-emerald-500 outline-none text-white"
                          />
                          <span className="text-xs text-zinc-500 font-mono">s</span>
                        </div>

                        <span className="text-[10px] font-mono text-zinc-400 ml-1">
                          ({track.endTime - track.startTime}s)
                        </span>
                      </div>
                    </td>

                    {/* Preview Button */}
                    <td className="py-3 px-3 text-center">
                      <ClipPreviewButton track={track} size="sm" showLabel />
                    </td>

                    {/* Actions */}
                    <td className="py-3 pr-4 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingTrack(track)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Override or enter YouTube URL manually"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {onDeleteTrack && (
                          <button
                            type="button"
                            onClick={() => onDeleteTrack(track.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Remove track from deck"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit YouTube Modal */}
      {editingTrack && (
        <ManualYoutubeModal
          track={editingTrack}
          isOpen={Boolean(editingTrack)}
          onClose={() => setEditingTrack(null)}
          onSave={(updated) => {
            onUpdateTrack(updated);
            setEditingTrack(null);
          }}
        />
      )}
    </div>
  );
};
