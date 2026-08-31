import React, { useState, useEffect } from "react";
import { Modal } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { ClipTimestampModal } from "./ClipTimestampModal";
import { ClipTimestampModalMobile } from "./ClipTimestampModalMobile";
import { ManualYoutubeModal } from "./ManualYoutubeModal";
import { TrackListMobile } from "./TrackListMobile";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { isVideoEmbedBlocked } from "../../lib/youtube/validator";
import {
  Search,
  Sparkles,
  Music2,
  Wrench,
} from "lucide-react";

interface TrackTableProps {
  deckId?: string;
  tracks: Track[];
  onUpdateTrack: (updatedTrack: Track) => void;
  onDeleteTrack?: (trackId: string) => void;
  onAutoMatchAll?: () => void;
  onAutoFixBlocked?: () => void;
  isMatching?: boolean;
  matchProgress?: { total: number; completed: number; matched: number; failed: number } | null;
  initialStatusFilter?: "all" | "matched" | "unmatched" | "blocked";
  onCancelMatching?: () => void;
}

function AutoMatchButton({
  showRainbow,
  className,
  fullWidth = false,
  disabled,
  isMatching,
  matchProgress,
  totalTracks,
  onClick,
}: {
  showRainbow: boolean;
  className?: string;
  fullWidth?: boolean;
  disabled: boolean;
  isMatching: boolean;
  matchProgress: { completed: number; total: number } | null;
  totalTracks: number;
  onClick: () => void;
}) {
  return (
    <span
      className={`pc-auto-match-rainbow${showRainbow ? " pc-auto-match-rainbow--active" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`pc-button pc-button--primary${fullWidth ? " w-full" : ""}`}
      >
        <Sparkles className={`w-4 h-4 ${isMatching ? "animate-spin" : ""}`} />
        <span>
          {isMatching
            ? `Matching (${matchProgress?.completed || 0}/${matchProgress?.total || totalTracks})...`
            : "Match all songs"}
        </span>
      </button>
    </span>
  );
}

export const TrackTable: React.FC<TrackTableProps> = ({
  deckId,
  tracks,
  onUpdateTrack,
  onDeleteTrack,
  onAutoMatchAll,
  onAutoFixBlocked,
  isMatching = false,
  matchProgress = null,
  initialStatusFilter = "all",
  onCancelMatching,
}) => {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched" | "blocked">(
    initialStatusFilter
  );
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [timestampEditingTrack, setTimestampEditingTrack] = useState<Track | null>(null);
  const [trackPendingDelete, setTrackPendingDelete] = useState<Track | null>(null);
  const [autoMatchRainbowDismissed, setAutoMatchRainbowDismissed] = useState(false);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    setAutoMatchRainbowDismissed(false);
  }, [deckId]);

  const isTrackBlocked = (track: Track): boolean => {
    if (track.matchStatus === "failed") return true;
    return isVideoEmbedBlocked(track.youtubeVideoId);
  };

  const isTrackReady = (track: Track) =>
    (track.matchStatus === "matched" || track.matchStatus === "manual") && !isTrackBlocked(track);

  const matchedCount = tracks.filter((t) => isTrackReady(t)).length;
  const blockedCount = tracks.filter((t) => isTrackBlocked(t)).length;
  const needsAttentionCount = tracks.length - matchedCount;
  const needsAttention = needsAttentionCount > 0;
  const showAutoMatchRainbow = needsAttention && !autoMatchRainbowDismissed;

  useEffect(() => {
    if (!needsAttention && statusFilter !== "all") {
      setStatusFilter("all");
    }
  }, [needsAttention, statusFilter]);

  // Filtered list
  const filteredTracks = tracks.filter((track) => {
    const matchesSearch =
      track.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (track.album && track.album.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "blocked") {
      return !isTrackReady(track);
    }
    if (statusFilter === "matched" || statusFilter === "unmatched") {
      return !isTrackReady(track);
    }
    return true;
  });

  const handleAutoMatchClick = () => {
    setAutoMatchRainbowDismissed(true);
    onAutoMatchAll?.();
  };

  return (
    <div className="pc-window">
      <div className="pc-titlebar">
        <div className="pc-titlebar-title">Tracks ({tracks.length})</div>
      </div>
      <div className="pc-window-content">
      <div className="flex flex-col gap-3 mb-4">
        <div className="relative w-full">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isMobile ? "Search tracks..." : "Filter tracks by title, artist, or album..."}
            className="pc-input w-full pl-8"
          />
        </div>

        {needsAttention && (isMobile ? (
          <>
            <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1 -mx-1 px-1">
              <button type="button" onClick={() => setStatusFilter("all")} className={`pc-button shrink-0 ${statusFilter === "all" ? "active" : ""}`}>
                All ({tracks.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("blocked")}
                className={`pc-button shrink-0 text-pc-warning ${statusFilter === "blocked" ? "active" : ""}`}
              >
                Needs attention ({needsAttentionCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onAutoFixBlocked && blockedCount > 0 && (
                <button
                  type="button"
                  onClick={onAutoFixBlocked}
                  disabled={isMatching}
                  className="pc-button flex-1 min-h-[44px]"
                >
                  <Wrench className="w-4 h-4" />
                  Fix all songs
                </button>
              )}
              {onAutoMatchAll && (
                <AutoMatchButton
                  showRainbow={showAutoMatchRainbow}
                  className="flex-1 min-h-[44px]"
                  fullWidth
                  disabled={isMatching}
                  isMatching={isMatching}
                  matchProgress={matchProgress}
                  totalTracks={tracks.length}
                  onClick={handleAutoMatchClick}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="flex items-center gap-1 text-xs">
                <button type="button" onClick={() => setStatusFilter("all")} className={`pc-button ${statusFilter === "all" ? "active" : ""}`}>
                  All ({tracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("blocked")}
                  className={`pc-button text-pc-warning ${statusFilter === "blocked" ? "active" : ""}`}
                >
                  Needs attention ({needsAttentionCount})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onAutoFixBlocked && blockedCount > 0 && (
                <button
                  type="button"
                  onClick={onAutoFixBlocked}
                  disabled={isMatching}
                  className="pc-button"
                >
                  <Wrench className="w-4 h-4" />
                  Fix all songs
                </button>
              )}
              {onAutoMatchAll && (
                <AutoMatchButton
                  showRainbow={showAutoMatchRainbow}
                  disabled={isMatching}
                  isMatching={isMatching}
                  matchProgress={matchProgress}
                  totalTracks={tracks.length}
                  onClick={handleAutoMatchClick}
                />
              )}
            </div>
          </div>
        ))}
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

      {filteredTracks.length === 0 ? (
        <div className="py-12 text-center pc-bevel-inset">
          <Music2 className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium text-sm">
            {tracks.length === 0
              ? "No songs in this deck yet."
              : "No tracks found matching your filter."}
          </p>
        </div>
      ) : (
        <TrackListMobile
          tracks={filteredTracks}
          onEditVideo={setEditingTrack}
          onEditClip={setTimestampEditingTrack}
          onDeleteTrack={onDeleteTrack ? setTrackPendingDelete : undefined}
          isTrackBlocked={isTrackBlocked}
          isBusy={isMatching}
        />
      )}

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

      {timestampEditingTrack && (isMobile ? (
        <ClipTimestampModalMobile
          track={timestampEditingTrack}
          isOpen
          onClose={() => setTimestampEditingTrack(null)}
          onSave={(updated) => {
            onUpdateTrack(updated);
            setTimestampEditingTrack(null);
          }}
        />
      ) : (
        <ClipTimestampModal
          track={timestampEditingTrack}
          isOpen
          onClose={() => setTimestampEditingTrack(null)}
          onSave={(updated) => {
            onUpdateTrack(updated);
            setTimestampEditingTrack(null);
          }}
        />
      ))}

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
