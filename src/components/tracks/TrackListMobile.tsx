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
  Sparkles,
} from "lucide-react";

interface TrackListMobileProps {
  tracks: Track[];
  onEditVideo: (track: Track) => void;
  onEditClip: (track: Track) => void;
  onDeleteTrack?: (track: Track) => void;
  onFindSimilar?: (track: Track) => void;
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
  if (track.matchStatus === "pending" || !track.media) {
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
  onFindSimilar,
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
          (track.media?.provider === "youtube" ? getYoutubeThumbnailUrl(track.media.id, "mqdefault") : null);
        const isBlocked = isTrackBlocked(track);
        const isReady =
          (track.matchStatus === "matched" || track.matchStatus === "manual") && !isBlocked;
        const hasVideo = Boolean(track.media && (track.media.provider === "youtube" || track.media.previewUrl));
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
          ...(onFindSimilar
            ? [
                {
                  icon: <Sparkles className="w-4 h-4" />,
                  label: "Find similar",
                  onClick: () => onFindSimilar(track),
                  disabled: isBusy,
                },
              ]
            : []),
          {
            icon: <Edit2 className="w-4 h-4" />,
            label: isBlocked ? "Fix source" : "Change source",
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
            className={`flex items-center gap-3 p-3 pc-bevel-inset ${
              isMobile ? "min-h-[72px]" : "min-h-[88px]"
            } ${isBlocked ? "bg-pc-warning" : ""}`}
          >
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className={`${isMobile ? "w-14 h-14" : "w-20 h-20"} object-cover shrink-0 pc-bevel-inset`}
              />
            ) : (
              <div
                className={`${isMobile ? "w-14 h-14" : "w-20 h-20"} pc-bevel-inset shrink-0 flex items-center justify-center`}
              >
                <Music2 className={isMobile ? "w-7 h-7" : "w-9 h-9"} />
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

            <div className={`flex items-center shrink-0 ${isMobile ? "gap-1" : "gap-1.5"}`}>
              {isReady ? (
                <button
                  type="button"
                  className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                  disabled={isBusy}
                  onClick={() => onEditClip(track)}
                  title="Edit clip timestamps"
                >
                  <Timer className="w-4 h-4" />
                  {isMobile ? <span>Edit clip</span> : "Edit clip"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${actionBtnClass} ${actionBtnSize} pc-button--primary`}
                  disabled={isBusy}
                  onClick={() => onEditVideo(track)}
                  title={isBlocked ? "Fix unavailable source" : "Link or change source"}
                >
                  <Edit2 className="w-4 h-4" />
                  {isMobile ? <span>Fix</span> : "Fix"}
                </button>
              )}
              {statusButton}
              <ClipPreviewButton
                track={track}
                size={isMobile ? "sm" : "md"}
                showLabel={!isMobile}
                className={isMobile ? actionBtnSize : `${actionBtnSize} !h-9`}
              />
              <OverflowMenu
                ariaLabel={`More actions for ${track.title}`}
                items={overflowItems}
                triggerClassName={actionBtnSize}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};
