import React, { useEffect, useState } from "react";
import { Play, Square, AlertCircle, Loader2 } from "lucide-react";
import { Track } from "../../types/deck";
import {
  playClip as playProviderClip,
  stopPlayback as stopProviderPlayback,
  subscribeToPlayerState as subscribeToProviderState,
  PlayerPlaybackState as ProviderPlaybackState,
} from "../../lib/player/player";
import { usePlayerUI } from "../../state/PlayerUIContext";
import { ensureFreshDeezerPreview, withFreshDeezerMedia } from "../../lib/deezer/previewUrl";
import { isTrackUnplayable } from "../../lib/youtube/validator";

interface ClipPreviewButtonProps {
  track: Track;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  onTrackMediaUpdated?: (updatedTrack: Track) => void;
}

export const ClipPreviewButton: React.FC<ClipPreviewButtonProps> = ({
  track,
  className = "",
  size = "md",
  showLabel = false,
  onTrackMediaUpdated,
}) => {
  const [playerState, setPlayerState] = useState<ProviderPlaybackState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { requestPlayerEngine } = usePlayerUI();

  useEffect(() => {
    return subscribeToProviderState((state) => {
      setPlayerState(state);
    });
  }, []);

  useEffect(() => {
    setRefreshFailed(false);
  }, [track.id]);

  const isCurrentTrack = playerState?.currentClip?.trackId === track.id;
  const isPlaying = isCurrentTrack && playerState?.state === "playing";
  const isLoading =
    isRefreshing ||
    (isCurrentTrack &&
      (playerState?.state === "buffering" || playerState?.state === "cued"));
  const hasError =
    refreshFailed || (isCurrentTrack && playerState?.state === "error");

  const durationSec = Math.max(1, track.endTime - track.startTime);
  const progressPercent = isCurrentTrack ? (playerState?.progress ?? 0) * 100 : 0;
  // Deezer tracks with a known ID can refresh a missing/expired preview on click.
  const canRefreshDeezer =
    track.media?.provider === "deezer" && Boolean(track.media.id);
  const needsAttention = isTrackUnplayable(track) && !canRefreshDeezer;
  const isDisabled = needsAttention && !isPlaying && !isLoading;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track.media) return;

    if (isPlaying || isLoading) {
      stopProviderPlayback();
      setIsRefreshing(false);
      return;
    }

    if (needsAttention) return;

    setRefreshFailed(false);

    void (async () => {
      let playTrack = track;
      if (track.media?.provider === "deezer") {
        setIsRefreshing(true);
        requestPlayerEngine("deezer");
        // Give React one paint for the loading state before resolving a fresh
        // signed URL. A cached/failed refresh can otherwise batch both state
        // updates and make the button appear not to react to the click.
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        try {
          const fresh = await ensureFreshDeezerPreview(track.media);
          playTrack = withFreshDeezerMedia(track, fresh.media);
          if (fresh.refreshed) onTrackMediaUpdated?.(playTrack);
        } catch {
          setIsRefreshing(false);
          setRefreshFailed(true);
          return;
        }
        setIsRefreshing(false);
      }

      if (!playTrack.media) return;
      requestPlayerEngine(playTrack.media.provider);
      playProviderClip({
        provider: playTrack.media.provider,
        sourceId: playTrack.media.id,
        previewUrl:
          playTrack.media.provider === "deezer"
            ? playTrack.media.previewUrl ?? undefined
            : undefined,
        startTime: playTrack.startTime,
        endTime: playTrack.endTime,
        trackId: playTrack.id,
        title: playTrack.title,
        artist: playTrack.artist,
      });
    })();
  };

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

  const disabledTitle = !track.media
    ? "No playable source matched yet"
    : track.media.provider === "deezer" && !track.media.previewUrl
      ? "No Deezer preview available"
      : "Can't preview — this clip needs attention";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title={
        isDisabled
          ? disabledTitle
          : isPlaying
          ? "Stop snippet preview"
          : `Play ${durationSec}s ${track.media?.provider === "deezer" ? "Deezer preview" : "YouTube snippet"}`
      }
      className={`relative inline-flex items-center justify-center font-medium pc-button select-none overflow-hidden ${
        sizeClasses[size]
      } ${isDisabled ? "opacity-50" : ""} ${isPlaying ? "active" : ""} ${className}`}
    >
      {isPlaying && (
        <span
          className="absolute inset-0 bg-emerald-400/30 transition-all pointer-events-none"
          style={{ width: `${progressPercent}%` }}
        />
      )}

      <span className="relative z-10 inline-flex items-center gap-1.5">
        {isLoading ? (
          <Loader2 className={`${iconSizes[size]} animate-spin`} />
        ) : hasError ? (
          <AlertCircle className={`${iconSizes[size]}`} />
        ) : isPlaying ? (
          <Square className={`${iconSizes[size]} fill-current`} />
        ) : (
          <Play className={`${iconSizes[size]} fill-current`} />
        )}

        {showLabel && (
          <span className="grid">
            <span className="invisible col-start-1 row-start-1" aria-hidden="true">
              Preview
            </span>
            <span className="col-start-1 row-start-1">
              {isPlaying ? "Stop" : "Preview"}
            </span>
          </span>
        )}
      </span>
    </button>
  );
};
