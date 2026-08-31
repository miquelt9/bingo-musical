import React from "react";
import { Track } from "../../types/deck";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { OverflowMenu } from "../ui/OverflowMenu";
import {
  getYoutubeThumbnailUrl,
} from "../../lib/youtube/parseUrl";
import {
  Music2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  Timer,
  Trash2,
} from "lucide-react";

interface TrackListMobileProps {
  tracks: Track[];
  onEditVideo: (track: Track) => void;
  onEditClip: (track: Track) => void;
  onDeleteTrack?: (track: Track) => void;
  isTrackBlocked: (track: Track) => boolean;
  isBusy?: boolean;
}

function StatusChip({
  track,
  isBlocked,
}: {
  track: Track;
  isBlocked: boolean;
}) {
  if (isBlocked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-pc-warning text-foreground">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        Needs attention
      </span>
    );
  }

  if (track.matchStatus === "matched" || track.matchStatus === "manual") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        Ready
      </span>
    );
  }

  if (track.matchStatus === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pc-warning">
        <AlertCircle className="w-3 h-3 shrink-0" />
        Unmatched
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      <Clock className="w-3 h-3 shrink-0 opacity-60" />
      Pending
    </span>
  );
}

export const TrackListMobile: React.FC<TrackListMobileProps> = ({
  tracks,
  onEditVideo,
  onEditClip,
  onDeleteTrack,
  isTrackBlocked,
  isBusy = false,
}) => {
  if (tracks.length === 0) {
    return (
      <div className="py-12 text-center pc-bevel-inset">
        <Music2 className="w-8 h-8 mx-auto mb-2" />
        <p className="font-medium text-sm">No tracks found matching your filter.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tracks.map((track) => {
        const thumb =
          track.albumArtUrl ||
          (track.youtubeVideoId ? getYoutubeThumbnailUrl(track.youtubeVideoId, "mqdefault") : null);
        const isBlocked = isTrackBlocked(track);
        const isReady =
          (track.matchStatus === "matched" || track.matchStatus === "manual") && !isBlocked;
        const hasVideo = Boolean(track.youtubeVideoId);

        const overflowItems = [
          {
            icon: <Edit2 className="w-4 h-4" />,
            label: isBlocked ? "Fix video" : "Change video",
            onClick: () => onEditVideo(track),
            disabled: isBusy,
          },
          ...(hasVideo
            ? [
                {
                  icon: <Timer className="w-4 h-4" />,
                  label: "Edit clip",
                  onClick: () => onEditClip(track),
                  disabled: isBusy,
                },
              ]
            : []),
          ...(onDeleteTrack
            ? [
                {
                  icon: <Trash2 className="w-4 h-4" />,
                  label: "Delete",
                  onClick: () => onDeleteTrack(track),
                  destructive: true,
                  disabled: isBusy,
                },
              ]
            : []),
        ];

        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 p-3 pc-bevel-inset min-h-[72px] ${
              isBlocked ? "bg-pc-warning" : ""
            }`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="w-12 h-12 object-cover shrink-0 pc-bevel-inset"
              />
            ) : (
              <div className="w-12 h-12 pc-bevel-inset shrink-0 flex items-center justify-center">
                <Music2 className="w-6 h-6" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{track.title}</p>
              <p className="text-xs truncate text-muted">{track.artist}</p>
              <div className="mt-1.5">
                <StatusChip track={track} isBlocked={isBlocked} />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isReady ? (
                <ClipPreviewButton track={track} size="sm" showLabel />
              ) : (
                <button
                  type="button"
                  className="pc-button pc-button--primary min-h-[44px] px-3"
                  disabled={isBusy}
                  onClick={() => onEditVideo(track)}
                  title={isBlocked ? "Fix unavailable video" : "Link or change YouTube video"}
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Fix</span>
                </button>
              )}
              <OverflowMenu
                ariaLabel={`Edit ${track.title}`}
                items={overflowItems}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};
