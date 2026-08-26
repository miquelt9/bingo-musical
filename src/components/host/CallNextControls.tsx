import React from "react";
import {
  Shuffle,
  RotateCcw,
  Play,
  Pause,
  SlidersHorizontal,
} from "lucide-react";

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
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
      {/* Top Stats & Progress */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Host Controls
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-black text-white">
              {calledCount} / {totalCount}
            </span>
            <span className="text-xs text-zinc-400">songs called</span>
          </div>
        </div>

        {/* Progress pill */}
        <div className="w-full sm:w-48">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 font-medium">
            <span>Pool Progress</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Main Call Next Button */}
        <button
          type="button"
          onClick={onCallNext}
          disabled={disabled || isDeckFinished}
          className={`sm:col-span-2 relative flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-black text-base sm:text-lg transition-all shadow-xl select-none active:scale-[0.98] ${
            isDeckFinished
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50"
              : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20 hover:shadow-emerald-500/30"
          }`}
        >
          <Shuffle className="w-6 h-6 stroke-[2.5]" />
          <span>
            {isDeckFinished
              ? "All Songs Called!"
              : calledCount === 0
              ? "Start Game & Call First Song"
              : "Call Next Song"}
          </span>
          <kbd className="hidden sm:inline-block ml-2 px-2 py-0.5 text-xs font-mono font-semibold rounded bg-zinc-950/20 text-zinc-900 border border-zinc-950/20">
            Space
          </kbd>
        </button>

        {/* Replay or Play/Pause Button */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={isPlaying ? onTogglePlayPause : onReplayCurrent}
            disabled={!hasCurrentTrack || disabled}
            title={isPlaying ? "Pause snippet" : "Replay current snippet"}
            className="flex-1 flex items-center justify-center gap-2 py-4 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 text-zinc-100 font-bold text-sm transition-all border border-zinc-700 active:scale-95"
          >
            {isPlaying ? (
              <>
                <Pause className="w-5 h-5 text-amber-400 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 text-emerald-400 fill-current" />
                <span>Replay</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onResetGame}
            title="Reset game and reshuffle bag"
            className="flex items-center justify-center p-4 rounded-2xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700 transition-all active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings Bar */}
      <div className="mt-6 pt-5 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRevealOnEnd}
            onChange={onToggleAutoReveal}
            className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 accent-emerald-500 cursor-pointer"
          />
          <span className="font-medium text-zinc-300">
            Auto-reveal answer when snippet finishes playing
          </span>
        </label>

        <div className="inline-flex items-center gap-2 text-zinc-500">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Non-repeating randomized shuffle bag</span>
        </div>
      </div>
    </div>
  );
};
