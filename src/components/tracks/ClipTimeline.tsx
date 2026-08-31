import React, { useRef } from "react";
import { formatDuration } from "../../lib/youtube/search";

export interface ClipTimelineProps {
  duration: number;
  start: number;
  end: number;
  current: number;
  onSeek?: (seconds: number) => void;
  variant?: "compact" | "touch";
}

export function ClipTimeline({
  duration,
  start,
  end,
  current,
  onSeek,
  variant = "compact",
}: ClipTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDuration = duration > 0 ? duration : Math.max(end, current, 1);
  const isTouch = variant === "touch";

  const toPercent = (seconds: number) =>
    Math.min(100, Math.max(0, (seconds / timelineDuration) * 100));

  const seekFromClientX = (clientX: number) => {
    if (!onSeek || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(Math.floor(ratio * timelineDuration));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekFromClientX(e.clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    if (touch) seekFromClientX(touch.clientX);
  };

  const startPct = toPercent(start);
  const endPct = toPercent(end);
  const currentPct = toPercent(current);
  const clipWidth = Math.max(0, endPct - startPct);

  return (
    <div className={`pc-bevel-inset ${isTouch ? "p-2 mb-2" : "p-3 mb-3"}`}>
      <div className="flex items-center justify-between text-[10px] uppercase font-bold mb-2">
        <span>Clip timeline</span>
        <span className="font-mono normal-case font-normal text-muted">
          {formatDuration(timelineDuration)} total
        </span>
      </div>

      <div
        ref={timelineRef}
        role="slider"
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={timelineDuration}
        aria-valuenow={current}
        tabIndex={onSeek ? 0 : -1}
        onClick={handleTimelineClick}
        onTouchEnd={onSeek ? handleTouchEnd : undefined}
        onKeyDown={(e) => {
          if (!onSeek) return;
          if (e.key === "ArrowLeft") onSeek(Math.max(0, current - 1));
          if (e.key === "ArrowRight") onSeek(Math.min(timelineDuration, current + 1));
        }}
        className={`relative pc-bevel-inset bg-[var(--pc-surface)] overflow-visible ${
          isTouch ? "h-10 min-h-[40px]" : "h-10"
        } ${onSeek ? "cursor-pointer touch-manipulation" : ""}`}
      >
        <div
          className="absolute inset-y-1 bg-emerald-500/35 border-y-2 border-emerald-600/80 pointer-events-none"
          style={{ left: `${startPct}%`, width: `${clipWidth}%` }}
        />

        <div
          className="absolute inset-y-0 w-0.5 -translate-x-px bg-emerald-700 pointer-events-none z-10"
          style={{ left: `${startPct}%` }}
        >
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase clip-timeline-label--start whitespace-nowrap">
            Start
          </span>
        </div>

        <div
          className="absolute inset-y-0 w-0.5 -translate-x-px bg-amber-600 pointer-events-none z-10"
          style={{ left: `${endPct}%` }}
        >
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase clip-timeline-label--end whitespace-nowrap">
            End
          </span>
        </div>

        <div
          className={`absolute -top-0.5 -bottom-0.5 -translate-x-1/2 bg-blue-600 shadow-sm pointer-events-none z-20 ${
            isTouch ? "w-1.5" : "w-1"
          }`}
          style={{ left: `${currentPct}%` }}
        >
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase clip-timeline-label--now whitespace-nowrap">
            Now
          </span>
        </div>
      </div>

      <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${isTouch ? "mt-4" : "mt-5"}`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-emerald-600 shrink-0" />
          <span>
            Start <span className="font-mono">{formatDuration(start)}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 bg-amber-600 shrink-0" />
          <span>
            End <span className="font-mono">{formatDuration(end)}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1 h-3 bg-blue-600 shrink-0" />
          <span>
            Now <span className="font-mono">{formatDuration(current)}</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 bg-emerald-500/35 border border-emerald-600/80 shrink-0" />
          <span>
            Clip <span className="font-mono">{formatDuration(Math.max(0, end - start))}</span>
          </span>
        </span>
      </div>

      {onSeek && !isTouch && (
        <p className="text-[10px] text-muted mt-2">
          Click the timeline to jump the video to that point.
        </p>
      )}
    </div>
  );
}
