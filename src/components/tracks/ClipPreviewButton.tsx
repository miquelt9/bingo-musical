import React, { useEffect, useState } from "react";
import { Play, Square, AlertCircle, Loader2 } from "lucide-react";
import { Track } from "../../types/deck";
import {
  playClip,
  stopPlayback,
  subscribeToPlayerState,
  PlayerPlaybackState,
} from "../../lib/youtube/player";

interface ClipPreviewButtonProps {
  track: Track;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export const ClipPreviewButton: React.FC<ClipPreviewButtonProps> = ({
  track,
  className = "",
  size = "md",
  showLabel = false,
}) => {
  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);

  useEffect(() => {
    return subscribeToPlayerState((state) => {
      setPlayerState(state);
    });
  }, []);

  const isCurrentTrack = playerState?.currentClip?.trackId === track.id;
  const isPlaying = isCurrentTrack && playerState?.state === "playing";
  const isBuffering = isCurrentTrack && playerState?.state === "buffering";
  const hasError = isCurrentTrack && playerState?.state === "error";

  const durationSec = Math.max(1, track.endTime - track.startTime);
  const progressPercent = isCurrentTrack ? (playerState?.progress ?? 0) * 100 : 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track.youtubeVideoId) return;

    if (isPlaying || isBuffering) {
      stopPlayback();
    } else {
      playClip({
        videoId: track.youtubeVideoId,
        startTime: track.startTime,
        endTime: track.endTime,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
      });
    }
  };

  const hasVideo = Boolean(track.youtubeVideoId);

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5 h-8",
    md: "px-3.5 py-1.5 text-sm gap-2 h-9",
    lg: "px-5 py-2.5 text-base gap-2.5 h-12",
  };

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!hasVideo}
      title={
        !hasVideo
          ? "No YouTube video matched yet"
          : isPlaying
          ? "Stop snippet preview"
          : `Play ${durationSec}s snippet (${track.startTime}s - ${track.endTime}s)`
      }
      className={`relative inline-flex items-center justify-center font-medium pc-button select-none overflow-hidden ${
        sizeClasses[size]
      } ${!hasVideo ? "opacity-50" : ""} ${isPlaying ? "active" : ""} ${className}`}
    >
      {/* Background progress fill when playing */}
      {isPlaying && (
        <span
          className="absolute inset-0 bg-emerald-400/30 transition-all pointer-events-none"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      <span className="relative z-10 inline-flex items-center gap-1.5">
        {isBuffering ? (
          <Loader2 className={`${iconSizes[size]} animate-spin`} />
        ) : hasError ? (
          <AlertCircle className={iconSizes[size]} />
        ) : isPlaying ? (
          <Square className={`${iconSizes[size]} fill-current`} />
        ) : (
          <Play className={`${iconSizes[size]} fill-current`} />
        )}

        {showLabel && (
          <span>
            {isPlaying ? "Stop" : "Preview"}
          </span>
        )}
      </span>
    </button>
  );
};
