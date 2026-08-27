import React from "react";
import { Button, Window } from "@miquelt9/pc-ui";
import { Shuffle, SlidersHorizontal } from "lucide-react";
import { NowPlayingControls } from "../player/NowPlayingControls";
import { PlayerPlaybackState } from "../../lib/youtube/player";

interface CallNextControlsProps {
  onCallNext: () => void;
  onReplayCurrent: () => void;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleVideo: () => void;
  showVideo: boolean;
  playerState: PlayerPlaybackState | null;
  isPlaying: boolean;
  hasCurrentTrack: boolean;
  remainingCount: number;
  totalCount: number;
  autoRevealOnEnd: boolean;
  onToggleAutoReveal: () => void;
  autoCallNextOnEnd: boolean;
  onToggleAutoCallNext: () => void;
  disabled?: boolean;
}

export const CallNextControls: React.FC<CallNextControlsProps> = ({
  onCallNext,
  onReplayCurrent,
  onTogglePlayPause,
  onStop,
  onToggleMute,
  onVolumeChange,
  onToggleVideo,
  showVideo,
  playerState,
  isPlaying,
  hasCurrentTrack,
  remainingCount,
  totalCount,
  autoRevealOnEnd,
  onToggleAutoReveal,
  autoCallNextOnEnd,
  onToggleAutoCallNext,
  disabled = false,
}) => {
  const isDeckFinished = remainingCount === 0 && totalCount > 0;
  const calledCount = totalCount - remainingCount;
  const progressPercent = totalCount > 0 ? (calledCount / totalCount) * 100 : 0;

  const handlePlayPause = () => {
    if (isPlaying) {
      onTogglePlayPause();
    } else if (hasCurrentTrack) {
      if (playerState?.state === "paused" && playerState?.currentClip) {
        onTogglePlayPause();
      } else {
        onReplayCurrent();
      }
    }
  };

  return (
    <Window title="Host Controls">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black">
              {calledCount} / {totalCount}
            </span>
            <span className="text-xs">songs called</span>
          </div>
        </div>
        <div className="w-full sm:w-48">
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span>Pool Progress</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-2 pc-bevel-inset overflow-hidden">
            <div className="h-full bg-[var(--pc-titlebar-bg)]" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={onCallNext}
          disabled={disabled || isDeckFinished}
          className="py-3"
        >
          <Shuffle className="w-5 h-5" />
          {isDeckFinished
            ? "All Songs Called!"
            : calledCount === 0
              ? "Start Game & Call First Song"
              : "Call Next Song"}
          <kbd className="hidden sm:inline-block ml-2 px-2 py-0.5 text-xs font-mono pc-bevel-inset">
            Space
          </kbd>
        </Button>
      </div>

      {hasCurrentTrack && playerState?.currentClip && (
        <div className="mt-4 pt-3 border-t border-[var(--pc-border)]">
          <p className="text-xs font-semibold mb-2">Now Playing</p>
          <NowPlayingControls
            playerState={playerState}
            onPlayPause={handlePlayPause}
            onStop={onStop}
            onToggleMute={onToggleMute}
            onVolumeChange={onVolumeChange}
            onToggleVideo={onToggleVideo}
            showVideo={showVideo}
          />
        </div>
      )}

      <div className="mt-4 pt-3 flex flex-col gap-3 text-xs">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoCallNextOnEnd}
            onChange={onToggleAutoCallNext}
            disabled={disabled}
          />
          <span className="font-medium">
            Auto-play next song when snippet ends
            <span className="block text-[10px] font-normal opacity-80 mt-0.5">
              Reveals the just-played call, then continues to the next song
            </span>
          </span>
        </label>

        {!autoCallNextOnEnd && (
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={autoRevealOnEnd} onChange={onToggleAutoReveal} />
            <span className="font-medium">Auto-reveal answer when snippet finishes playing</span>
          </label>
        )}

        <div className="inline-flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Non-repeating randomized shuffle bag</span>
        </div>
      </div>
    </Window>
  );
};
