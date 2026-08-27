import React from "react";
import { Button, Window } from "@miquelt9/pc-ui";
import { Shuffle, RotateCcw, Play, Pause, SlidersHorizontal } from "lucide-react";

interface CallNextControlsProps {
  onCallNext: () => void;
  onReplayCurrent: () => void;
  onTogglePlayPause: () => void;
  onResetGame: () => void;
  isPlaying: boolean;
  hasCurrentTrack: boolean;
  remainingCount: number;
  totalCount: number;
  autoRevealOnEnd: boolean;
  onToggleAutoReveal: () => void;
  disabled?: boolean;
}

export const CallNextControls: React.FC<CallNextControlsProps> = ({
  onCallNext,
  onReplayCurrent,
  onTogglePlayPause,
  onResetGame,
  isPlaying,
  hasCurrentTrack,
  remainingCount,
  totalCount,
  autoRevealOnEnd,
  onToggleAutoReveal,
  disabled = false,
}) => {
  const isDeckFinished = remainingCount === 0 && totalCount > 0;
  const calledCount = totalCount - remainingCount;
  const progressPercent = totalCount > 0 ? (calledCount / totalCount) * 100 : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={onCallNext}
          disabled={disabled || isDeckFinished}
          className="sm:col-span-2 py-3"
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
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={isPlaying ? onTogglePlayPause : onReplayCurrent}
            disabled={!hasCurrentTrack || disabled}
            title={isPlaying ? "Pause snippet" : "Replay current snippet"}
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Replay
              </>
            )}
          </Button>
          <Button type="button" onClick={onResetGame} title="Reset game and reshuffle bag">
            <RotateCcw className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-4 text-xs">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={autoRevealOnEnd} onChange={onToggleAutoReveal} />
          <span className="font-medium">Auto-reveal answer when snippet finishes playing</span>
        </label>
        <div className="inline-flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Non-repeating randomized shuffle bag</span>
        </div>
      </div>
    </Window>
  );
};
