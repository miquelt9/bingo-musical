import React from "react";
import { Music, Volume2, VolumeX, Square, Play, Pause, ChevronDown, ChevronUp } from "lucide-react";
import { PlayerPlaybackState } from "../../lib/youtube/player";

interface NowPlayingControlsProps {
  playerState: PlayerPlaybackState | null;
  onPlayPause: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleVideo: () => void;
  showVideo: boolean;
  showVideoToggle?: boolean;
  compact?: boolean;
}

export const NowPlayingControls: React.FC<NowPlayingControlsProps> = ({
  playerState,
  onPlayPause,
  onStop,
  onToggleMute,
  onVolumeChange,
  onToggleVideo,
  showVideo,
  showVideoToggle = true,
  compact = false,
}) => {
  const isPlaying = playerState?.state === "playing";

  return (
    <div className={`flex ${compact ? "flex-row items-center gap-2" : "flex-col sm:flex-row items-center justify-between gap-3"}`}>
      <div className={`flex items-center gap-3 min-w-0 ${compact ? "" : "w-full sm:w-auto"}`}>
        <Music className={`w-5 h-5 shrink-0 ${isPlaying ? "animate-bounce" : ""}`} />
        <div className="min-w-0">
          <p className={`font-bold truncate ${compact ? "text-xs max-w-[140px]" : "text-sm max-w-xs sm:max-w-md"}`}>
            {playerState?.currentClip?.title || "Playing YouTube Snippet"}
          </p>
          {!compact && (
            <p className="text-xs truncate max-w-xs sm:max-w-md">
              {playerState?.errorMessage ? (
                <span className="text-red-500 font-semibold">{playerState.errorMessage}</span>
              ) : (
                <>
                  {playerState?.currentClip?.artist || "Audio snippet"} •{" "}
                  {(playerState?.remainingTime ?? 0).toFixed(1)}s remaining
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="pc-button"
          onClick={onPlayPause}
          title={isPlaying ? "Pause" : "Play / Replay"}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
        <button type="button" className="pc-button" onClick={onStop} title="Stop playback">
          <Square className="w-4 h-4 fill-current" />
        </button>
        <button
          type="button"
          className="pc-button"
          onClick={onToggleMute}
          title={playerState?.isMuted ? "Unmute" : "Mute"}
        >
          {playerState?.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={playerState?.volume ?? 100}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className={`w-20 cursor-pointer hidden sm:block ${playerState?.isMuted ? "opacity-40" : ""}`}
          aria-label="Volume"
        />
        {showVideoToggle && (
          <button
            type="button"
            className="pc-button"
            onClick={onToggleVideo}
            title="Toggle visual video preview"
          >
            <span>Video</span>
            {showVideo ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
};
