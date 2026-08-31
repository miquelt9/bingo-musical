import React from "react";
import { Track } from "../../types/deck";
import { ClipPreviewButton } from "./ClipPreviewButton";
import { OverflowMenu } from "../ui/OverflowMenu";
import { useIsMobile } from "../../hooks/useMediaQuery";
import {
  getYoutubeThumbnailUrl,
} from "../../lib/youtube/parseUrl";
import {
  Music2,
  Edit2,
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

function getErrorStatus(
  track: Track,
  isBlocked: boolean
): { label: string; icon: React.ReactNode } | null {
  if (isBlocked) {
    return {
      label: "Needs attention",
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    };
  }
  if (track.matchStatus === "failed") {
    return {
      label: "Unmatched",
      icon: <AlertCircle className="w-4 h-4 shrink-0" />,
    };
  }
  if (track.matchStatus === "pending" || !track.youtubeVideoId) {
    return {
      label: "Pending",
      icon: <Clock className="w-4 h-4 shrink-0 opacity-60" />,
    };
  }
  return null;
}

export const TrackListMobile: React.FC<TrackListMobileProps> = ({
  tracks,
  onEditVideo,
  onEditClip,
  onDeleteTrack,
  isTrackBlocked,
  isBusy = false,
}) => {
  const isMobile = useIsMobile();
  const actionBtnClass =
    "pc-button inline-flex items-center justify-center gap-1.5 shrink-0";
  const actionBtnSize = isMobile ? "min-h-[44px] px-3" : "h-9 min-h-9 px-3 text-xs";

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
        const errorStatus = getErrorStatus(track, isBlocked);

        const statusButton = errorStatus ? (
          <button
            type="button"
            className={`${actionBtnClass} ${actionBtnSize} ${
              isBlocked ? "text-pc-warning" : ""
            } pointer-events-none`}
            tabIndex={-1}
            aria-disabled="true"
          >
            {errorStatus.icon}
            <span>{errorStatus.label}</span>
          </button>
        ) : null;

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

        const mobileActions = (
          <div className="flex items-center gap-1 shrink-0">
            {isReady ? (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                disabled={isBusy}
                onClick={() => onEditClip(track)}
                title="Edit clip timestamps"
              >
                <Timer className="w-4 h-4" />
                <span>Edit clip</span>
              </button>
            ) : (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                disabled={isBusy}
                onClick={() => onEditVideo(track)}
                title={isBlocked ? "Fix unavailable video" : "Link or change YouTube video"}
              >
                <Edit2 className="w-4 h-4" />
                <span>Fix</span>
              </button>
            )}
            {statusButton}
            <ClipPreviewButton track={track} size="sm" className={actionBtnSize} />
            <OverflowMenu ariaLabel={`Edit ${track.title}`} items={overflowItems} />
          </div>
        );

        const desktopActions = (
          <div className="flex items-center gap-1.5 shrink-0">
            {isReady ? (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                disabled={isBusy}
                onClick={() => onEditClip(track)}
                title="Edit clip timestamps"
              >
                <Timer className="w-4 h-4" />
                Edit clip
              </button>
            ) : (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                disabled={isBusy}
                onClick={() => onEditVideo(track)}
                title={isBlocked ? "Fix unavailable video" : "Link or change YouTube video"}
              >
                <Edit2 className="w-4 h-4" />
                Fix
              </button>
            )}
            {statusButton}
            <ClipPreviewButton
              track={track}
              size="md"
              showLabel
              className={`${actionBtnSize} !h-9`}
            />
            {isReady && (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize}`}
                disabled={isBusy}
                onClick={() => onEditVideo(track)}
                title="Change YouTube video"
              >
                <Edit2 className="w-4 h-4" />
                Change video
              </button>
            )}
            {onDeleteTrack && (
              <button
                type="button"
                className={`${actionBtnClass} ${actionBtnSize}`}
                disabled={isBusy}
                onClick={() => onDeleteTrack(track)}
                title="Remove song from deck"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        );

        const thumbSize = isMobile ? "w-14 h-14" : "w-20 h-20";
        const thumbIconSize = isMobile ? "w-7 h-7" : "w-9 h-9";

        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 p-3 pc-bevel-inset ${
              isMobile ? "min-h-[72px]" : "min-h-[88px]"
            } ${isBlocked ? "bg-pc-warning" : ""}`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className={`${thumbSize} object-cover shrink-0 pc-bevel-inset`}
              />
            ) : (
              <div className={`${thumbSize} pc-bevel-inset shrink-0 flex items-center justify-center`}>
                <Music2 className={thumbIconSize} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${isMobile ? "text-base" : "text-lg"}`}>
                {track.title}
              </p>
              <p className={`truncate text-muted ${isMobile ? "text-sm" : "text-base"}`}>
                {track.artist}
              </p>
            </div>

            {isMobile ? mobileActions : desktopActions}
          </li>
        );
      })}
    </ul>
  );
};
