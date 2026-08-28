import React, { useState, useEffect } from "react";
import { Modal } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { ClipTimestampModal } from "./ClipTimestampModal";
import { ManualYoutubeModal } from "./ManualYoutubeModal";
import {
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
} from "../../lib/youtube/parseUrl";
import { isVideoEmbedBlocked } from "../../lib/youtube/validator";
import {
  Search,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  Edit2,
  Timer,
  Trash2,
  Music2,
  ShieldCheck,
  Loader2,
} from "lucide-react";

interface TrackTableProps {
  tracks: Track[];
  onUpdateTrack: (updatedTrack: Track) => void;
  onDeleteTrack?: (trackId: string) => void;
  onAutoMatchAll?: () => void;
  onAutoFixBlocked?: () => void;
  isMatching?: boolean;
  matchProgress?: { total: number; completed: number; matched: number; failed: number } | null;
  onVerifyAllEmbeds?: () => void;
  isValidating?: boolean;
  validationProgress?: { total: number; completed: number; valid: number; invalid: number; currentTrackTitle?: string } | null;
  initialStatusFilter?: "all" | "matched" | "unmatched" | "blocked";
  onCancelMatching?: () => void;
  onCancelValidation?: () => void;
}

function StatusIconBadge({
  title,
  onClick,
  tone = "neutral",
  children,
}: {
  title: string;
  onClick?: (e: React.MouseEvent) => void;
  tone?: "success" | "danger" | "warning" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-green-700 dark:text-green-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : tone === "warning"
          ? "text-pc-warning"
          : "text-muted";

  const className = `pc-button inline-flex items-center justify-center w-9 h-9 p-0 shrink-0 ${toneClass}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title={title}>
        {children}
      </button>
    );
  }

  return (
    <span className={`${className} cursor-default`} title={title}>
      {children}
    </span>
  );
}

export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  onUpdateTrack,
  onDeleteTrack,
  onAutoMatchAll,
  onAutoFixBlocked,
  isMatching = false,
  matchProgress = null,
  onVerifyAllEmbeds,
  isValidating = false,
  validationProgress = null,
  initialStatusFilter = "all",
  onCancelMatching,
  onCancelValidation,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched" | "blocked">(
    initialStatusFilter
  );
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [timestampEditingTrack, setTimestampEditingTrack] = useState<Track | null>(null);
  const [trackPendingDelete, setTrackPendingDelete] = useState<Track | null>(null);
  const [activeCoachmarkId, setActiveCoachmarkId] = useState<string | null>(null);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const isTrackBlocked = (track: Track): boolean => {
    if (track.matchStatus === "failed") return true;
    return isVideoEmbedBlocked(track.youtubeVideoId);
  };

  // Filtered list
  const filteredTracks = tracks.filter((track) => {
    const matchesSearch =
      track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (track.album && track.album.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "matched") {
      return (track.matchStatus === "matched" || track.matchStatus === "manual") && !isTrackBlocked(track);
    }
    if (statusFilter === "unmatched") {
      return track.matchStatus === "pending" || !track.youtubeVideoId;
    }
    if (statusFilter === "blocked") {
      return isTrackBlocked(track);
    }
    return true;
  });

  const matchedCount = tracks.filter((t) => (t.matchStatus === "matched" || t.matchStatus === "manual") && !isTrackBlocked(t)).length;
  const blockedCount = tracks.filter((t) => isTrackBlocked(t)).length;
  const unmatchedCount = tracks.length - matchedCount - blockedCount;

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
    <div className="pc-window">
      <div className="pc-titlebar">
        <div className="pc-titlebar-title">Tracks ({tracks.length})</div>
      </div>
      <div className="pc-window-content">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter tracks by title, artist, or album..."
              className="pc-input w-full pl-8"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button type="button" onClick={() => setStatusFilter("all")} className={`pc-button ${statusFilter === "all" ? "active" : ""}`}>
              All ({tracks.length})
            </button>
            <button type="button" onClick={() => setStatusFilter("matched")} className={`pc-button ${statusFilter === "matched" ? "active" : ""}`}>
              Ready ({matchedCount})
            </button>
            {blockedCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("blocked")}
                className={`pc-button text-pc-warning ${statusFilter === "blocked" ? "active" : ""}`}
              >
                Needs Attention ({blockedCount})
              </button>
            )}
            {unmatchedCount > 0 && (
              <button type="button" onClick={() => setStatusFilter("unmatched")} className={`pc-button ${statusFilter === "unmatched" ? "active" : ""}`}>
                Unmatched ({unmatchedCount})
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onVerifyAllEmbeds && (
            <button
              type="button"
              onClick={onVerifyAllEmbeds}
              disabled={isValidating || isMatching || tracks.length === 0}
              className="pc-button"
              title="Test all song video links to ensure they play smoothly in game"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Checking ({validationProgress?.completed || 0}/{validationProgress?.total || tracks.length})...
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Check Audio</span>
                </>
              )}
            </button>
          )}

          {onAutoMatchAll && (
            <button
              type="button"
              onClick={onAutoMatchAll}
              disabled={isMatching || isValidating || (unmatchedCount === 0 && blockedCount === 0)}
              className="pc-button pc-button--primary"
            >
              <Sparkles className={`w-4 h-4 ${isMatching ? "animate-spin" : ""}`} />
              <span>
                {isMatching
                  ? `Matching (${matchProgress?.completed || 0}/${matchProgress?.total || tracks.length})...`
                  : "Auto-Match All"}
              </span>
            </button>
          )}
        </div>
      </div>

      {isMatching && matchProgress && (
        <div className="mb-4 p-3 pc-bevel-inset text-xs">
          <div className="flex items-center justify-between mb-2 font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Matching songs with verified YouTube audio...</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono">
                {matchProgress.completed} / {matchProgress.total} ({Math.round((matchProgress.completed / matchProgress.total) * 100)}%)
              </span>
              {onCancelMatching && (
                <button type="button" onClick={onCancelMatching} className="pc-button text-[11px]">
                  Cancel
                </button>
              )}
            </span>
          </div>
          <div className="w-full h-2 pc-bevel-inset overflow-hidden">
            <div
              className="h-full bg-[var(--pc-titlebar-bg)]"
              style={{ width: `${(matchProgress.completed / matchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isValidating && validationProgress && (
        <div className="mb-4 p-3 pc-bevel-inset text-xs">
          <div className="flex items-center justify-between mb-2 font-medium">
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                Checking audio compatibility: {validationProgress.currentTrackTitle || "Testing songs..."}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono">
                {validationProgress.completed} / {validationProgress.total} ({Math.round((validationProgress.completed / validationProgress.total) * 100)}%)
              </span>
              {onCancelValidation && (
                <button type="button" onClick={onCancelValidation} className="pc-button text-[11px]">
                  Cancel
                </button>
              )}
            </span>
          </div>
          <div className="w-full h-2 pc-bevel-inset overflow-hidden">
            <div
              className="h-full bg-green-600"
              style={{ width: `${(validationProgress.completed / validationProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto pc-bevel-inset">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="text-xs font-bold">
              <th className="py-2 pl-3 pr-2 w-10 text-center">#</th>
              <th className="py-2 px-3">Song & Artist</th>
              <th className="py-2 px-2 w-20 text-center">Status</th>
              <th className="py-2 px-3 w-36">YouTube Video</th>
              <th className="py-2 px-3 w-48 text-center">Snippet Timestamps</th>
              <th className="py-2 px-3 w-32 text-center">Preview</th>
              <th className="py-2 pr-3 pl-2 w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTracks.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Music2 className="w-8 h-8 mx-auto mb-2" />
                  <p className="font-medium text-sm">
                    {tracks.length === 0
                      ? "No songs in this deck yet."
                      : "No tracks found matching your filter."}
                  </p>
                </td>
              </tr>
            ) : (
              filteredTracks.map((track, idx) => {
                const thumb = track.albumArtUrl || (track.youtubeVideoId ? getYoutubeThumbnailUrl(track.youtubeVideoId, "mqdefault") : null);
                const isBlocked = isTrackBlocked(track);
                const isCoachmarkOpen = activeCoachmarkId === track.id;

                return (
                  <tr key={track.id} className={isBlocked ? "bg-pc-warning" : ""}>
                    <td className="py-2 pl-3 pr-2 text-center font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-3">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-10 h-10 object-cover shrink-0 pc-bevel-inset" />
                        ) : (
                          <div className="w-10 h-10 pc-bevel-inset shrink-0 flex items-center justify-center">
                            <Music2 className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate max-w-[260px] sm:max-w-xs">{track.title}</p>
                          <p className="text-xs truncate max-w-[260px] sm:max-w-xs">{track.artist}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {isBlocked ? (
                        <div className="relative inline-flex items-center justify-center">
                          <StatusIconBadge
                            title="Audio unavailable in game — click for info"
                            tone="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCoachmarkId(isCoachmarkOpen ? null : track.id);
                            }}
                          >
                            <XCircle className="w-5 h-5" />
                          </StatusIconBadge>

                          {/* Coachmark popover explaining the issue */}
                          {isCoachmarkOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setActiveCoachmarkId(null)}
                              />
                              <div
                                className={`absolute ${
                                  idx < 3 ? "top-full mt-1.5" : "bottom-full mb-1.5"
                                } left-1/2 -translate-x-1/2 w-64 p-3 pc-window z-50 shadow-2xl text-left text-xs`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-start justify-between gap-1 mb-1 text-red-600 dark:text-red-400">
                                  <span className="flex items-center gap-1.5 font-extrabold">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>Audio Unavailable</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveCoachmarkId(null)}
                                    className="text-muted hover:text-foreground text-xs px-1 font-mono cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                  The video owner restricted this song from playing outside YouTube.
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-border flex flex-col gap-2">
                                  {onAutoFixBlocked && (
                                    <button
                                      type="button"
                                      className="pc-button pc-button--primary w-full text-[11px]"
                                      disabled={isMatching || isValidating}
                                      onClick={() => {
                                        setActiveCoachmarkId(null);
                                        onAutoFixBlocked();
                                      }}
                                    >
                                      <Sparkles className={`w-3.5 h-3.5 ${isMatching ? "animate-spin" : ""}`} />
                                      <span>{isMatching ? "Auto-fixing..." : "Auto-Fix"}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="pc-button pc-button--primary w-full text-[11px]"
                                    onClick={() => {
                                      setActiveCoachmarkId(null);
                                      setEditingTrack(track);
                                    }}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    <span>Change Video</span>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (track.matchStatus === "matched" || track.matchStatus === "manual") ? (
                        <StatusIconBadge title="Ready to play" tone="success">
                          <CheckCircle2 className="w-5 h-5" />
                        </StatusIconBadge>
                      ) : track.matchStatus === "failed" ? (
                        <StatusIconBadge title="No video match found" tone="warning">
                          <AlertCircle className="w-5 h-5" />
                        </StatusIconBadge>
                      ) : (
                        <StatusIconBadge title="Pending search" tone="neutral">
                          <Clock className="w-5 h-5 opacity-60" />
                        </StatusIconBadge>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {track.youtubeVideoId ? (
                        <a
                          href={getYoutubeWatchUrl(track.youtubeVideoId, track.startTime)}
                          target="_blank"
                          rel="noreferrer"
                          className="pc-link inline-flex items-center gap-1 text-xs font-mono truncate max-w-[120px]"
                          title="Open video on YouTube"
                        >
                          <span>{track.youtubeVideoId}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs italic">No video linked</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase">Start</span>
                          <input
                            type="number"
                            min="0"
                            value={track.startTime}
                            onChange={(e) => handleTimeChange(track, "startTime", e.target.value)}
                            className="pc-input w-14 px-1 py-0.5 text-center font-mono text-xs"
                          />
                          <span className="text-xs font-mono">s</span>
                        </div>
                        <span className="font-mono">-</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] uppercase">End</span>
                          <input
                            type="number"
                            min={track.startTime + 1}
                            value={track.endTime}
                            onChange={(e) => handleTimeChange(track, "endTime", e.target.value)}
                            className="pc-input w-14 px-1 py-0.5 text-center font-mono text-xs"
                          />
                          <span className="text-xs font-mono">s</span>
                        </div>
                        <span className="text-[10px] font-mono ml-1">
                          ({track.endTime - track.startTime}s)
                        </span>
                        <button
                          type="button"
                          className="pc-button p-1 shrink-0"
                          disabled={!track.youtubeVideoId}
                          onClick={() => setTimestampEditingTrack(track)}
                          title={
                            track.youtubeVideoId
                              ? "Edit clip timestamps with video"
                              : "Link a YouTube video first"
                          }
                        >
                          <Timer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <ClipPreviewButton track={track} size="sm" showLabel />
                    </td>
                    <td className="py-2 pr-3 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="pc-button"
                          onClick={() => setEditingTrack(track)}
                          title={isBlocked ? "Replace unavailable YouTube video" : "Change YouTube video"}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {onDeleteTrack && (
                          <button
                            type="button"
                            className="pc-button"
                            onClick={() => setTrackPendingDelete(track)}
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

      {timestampEditingTrack && (
        <ClipTimestampModal
          track={timestampEditingTrack}
          isOpen
          onClose={() => setTimestampEditingTrack(null)}
          onSave={(updated) => {
            onUpdateTrack(updated);
            setTimestampEditingTrack(null);
          }}
        />
      )}

      {trackPendingDelete && onDeleteTrack && (
        <Modal
          open
          variant="danger"
          title="Remove song"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            onDeleteTrack(trackPendingDelete.id);
            setTrackPendingDelete(null);
          }}
          onCancel={() => setTrackPendingDelete(null)}
        >
          <p>
            Remove <strong>{trackPendingDelete.artist} — {trackPendingDelete.title}</strong> from
            this deck? This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
};
