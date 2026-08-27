import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { loadYoutubeApi } from "../../lib/youtube/player";
import { formatDuration } from "../../lib/youtube/search";
import { PcModal } from "../ui/PcModal";
import { Loader2, Play, Square } from "lucide-react";

const MIN_CLIP_SECONDS = 5;

interface ClipTimelineProps {
  duration: number;
  start: number;
  end: number;
  current: number;
  onSeek?: (seconds: number) => void;
}

function ClipTimeline({ duration, start, end, current, onSeek }: ClipTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDuration = duration > 0 ? duration : Math.max(end, current, 1);

  const toPercent = (seconds: number) =>
    Math.min(100, Math.max(0, (seconds / timelineDuration) * 100));

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(Math.floor(ratio * timelineDuration));
  };

  const startPct = toPercent(start);
  const endPct = toPercent(end);
  const currentPct = toPercent(current);
  const clipWidth = Math.max(0, endPct - startPct);

  return (
    <div className="mb-3 pc-bevel-inset p-3">
      <div className="flex items-center justify-between text-[10px] uppercase font-bold mb-2">
        <span>Clip timeline</span>
        <span className="font-mono normal-case font-normal opacity-75">
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
        onKeyDown={(e) => {
          if (!onSeek) return;
          if (e.key === "ArrowLeft") onSeek(Math.max(0, current - 1));
          if (e.key === "ArrowRight") onSeek(Math.min(timelineDuration, current + 1));
        }}
        className={`relative h-10 pc-bevel-inset bg-[var(--pc-surface)] overflow-visible ${
          onSeek ? "cursor-pointer" : ""
        }`}
      >
        <div
          className="absolute inset-y-1 bg-emerald-500/35 border-y-2 border-emerald-600/80 pointer-events-none"
          style={{ left: `${startPct}%`, width: `${clipWidth}%` }}
        />

        <div
          className="absolute inset-y-0 w-0.5 -translate-x-px bg-emerald-700 pointer-events-none z-10"
          style={{ left: `${startPct}%` }}
        >
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
            Start
          </span>
        </div>

        <div
          className="absolute inset-y-0 w-0.5 -translate-x-px bg-amber-600 pointer-events-none z-10"
          style={{ left: `${endPct}%` }}
        >
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400 whitespace-nowrap">
            End
          </span>
        </div>

        <div
          className="absolute -top-0.5 -bottom-0.5 w-1 -translate-x-1/2 bg-blue-600 shadow-sm pointer-events-none z-20"
          style={{ left: `${currentPct}%` }}
        >
          <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase text-blue-700 dark:text-blue-400 whitespace-nowrap">
            Now
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-5 text-[10px]">
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

      {onSeek && (
        <p className="text-[10px] opacity-60 mt-2">Click the timeline to jump the video to that point.</p>
      )}
    </div>
  );
}

interface ClipTimestampModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export const ClipTimestampModal: React.FC<ClipTimestampModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const reactId = useId();
  const elementId = `yt-clip-editor-${track.id}-${reactId.replace(/:/g, "")}`;

  const playerRef = useRef<YT.Player | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const [draftStart, setDraftStart] = useState(track.startTime);
  const [draftEnd, setDraftEnd] = useState(track.endTime);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const hasVideo = Boolean(track.youtubeVideoId);
  const clipDuration = Math.max(0, draftEnd - draftStart);
  const isValid = draftStart >= 0 && draftEnd >= draftStart + MIN_CLIP_SECONDS;

  const stopPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setIsPreviewing(false);
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    stopPreview();
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      playerRef.current?.destroy();
    } catch {
      // ignore
    }
    playerRef.current = null;
    setIsPlayerReady(false);
    setIsLoadingPlayer(false);
  }, [stopPreview]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftStart(track.startTime);
    setDraftEnd(track.endTime);
    setCurrentTime(0);
    setVideoDuration(0);
    setPlayerError(null);
    setIsPreviewing(false);
  }, [isOpen, track.startTime, track.endTime, track.id]);

  useEffect(() => {
    if (!isOpen || !hasVideo || !track.youtubeVideoId) {
      destroyPlayer();
      return;
    }

    let cancelled = false;
    setIsLoadingPlayer(true);
    setPlayerError(null);

    const initPlayer = async () => {
      try {
        await loadYoutubeApi();
        if (cancelled) return;

        const player = new window.YT!.Player(elementId, {
          width: "100%",
          height: "100%",
          videoId: track.youtubeVideoId!,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: track.startTime,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setIsPlayerReady(true);
              setIsLoadingPlayer(false);
              const duration = event.target.getDuration?.() ?? 0;
              if (duration > 0) {
                setVideoDuration(duration);
              }
              const time = event.target.getCurrentTime?.() ?? 0;
              setCurrentTime(time);
            },
            onError: () => {
              if (cancelled) return;
              setPlayerError("Failed to load video. The video may be unavailable or restricted.");
              setIsLoadingPlayer(false);
            },
          },
        });

        if (!cancelled) {
          playerRef.current = player;
        }
      } catch {
        if (!cancelled) {
          setPlayerError("Failed to initialize YouTube player.");
          setIsLoadingPlayer(false);
        }
      }
    };

    void initPlayer();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [isOpen, hasVideo, track.youtubeVideoId, track.startTime, elementId, destroyPlayer]);

  useEffect(() => {
    if (!isOpen || !isPlayerReady) return;

    pollTimerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      const time = player.getCurrentTime() ?? 0;
      setCurrentTime(time);
      const duration = player.getDuration?.() ?? 0;
      if (duration > 0) {
        setVideoDuration(duration);
      }
    }, 250);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, isPlayerReady]);

  const handleSetStart = () => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== "function") return;
    const nextStart = Math.max(0, Math.floor(player.getCurrentTime() ?? 0));
    const maxStart = videoDuration > 0 ? Math.max(0, videoDuration - MIN_CLIP_SECONDS) : draftEnd - MIN_CLIP_SECONDS;
    const clampedStart = videoDuration > 0 ? Math.min(nextStart, maxStart) : nextStart;
    setDraftStart(clampedStart);
    if (draftEnd < clampedStart + MIN_CLIP_SECONDS) {
      const nextEnd = videoDuration > 0
        ? Math.min(videoDuration, clampedStart + MIN_CLIP_SECONDS)
        : clampedStart + MIN_CLIP_SECONDS;
      setDraftEnd(nextEnd);
    }
  };

  const handleSetEnd = () => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== "function") return;
    let nextEnd = Math.max(draftStart + MIN_CLIP_SECONDS, Math.floor(player.getCurrentTime() ?? 0));
    if (videoDuration > 0) {
      nextEnd = Math.min(nextEnd, videoDuration);
    }
    setDraftEnd(nextEnd);
  };

  const handleSeek = (seconds: number) => {
    const player = playerRef.current;
    if (!player || typeof player.seekTo !== "function") return;
    const max = videoDuration > 0 ? videoDuration : seconds;
    const clamped = Math.max(0, Math.min(seconds, max));
    player.seekTo(clamped, true);
    setCurrentTime(clamped);
  };

  const handlePreview = () => {
    const player = playerRef.current;
    if (!player || !isValid) return;

    if (isPreviewing) {
      stopPreview();
      return;
    }

    setIsPreviewing(true);
    player.seekTo(draftStart, true);
    player.playVideo();

    const watchEnd = () => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") {
        stopPreview();
        return;
      }
      const time = p.getCurrentTime() ?? 0;
      if (time >= draftEnd - 0.2) {
        p.pauseVideo();
        stopPreview();
        return;
      }
      previewRafRef.current = requestAnimationFrame(watchEnd);
    };

    previewRafRef.current = requestAnimationFrame(watchEnd);
  };

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      ...track,
      startTime: draftStart,
      endTime: draftEnd,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <PcModal
      title={`Edit clip — ${track.title}`}
      onClose={onClose}
      className="max-w-2xl"
    >
      <p className="text-sm mb-3">{track.artist}</p>

      {!hasVideo ? (
        <p className="text-sm mb-4">Link a YouTube video before editing clip timestamps.</p>
      ) : (
        <>
          <div className="relative aspect-video w-full pc-bevel-inset overflow-hidden bg-black mb-3">
            <div id={elementId} className="absolute inset-0" />
            {(isLoadingPlayer || !isPlayerReady) && !playerError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            )}
            {playerError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-400">
                {playerError}
              </div>
            )}
          </div>

          <ClipTimeline
            duration={videoDuration}
            start={draftStart}
            end={draftEnd}
            current={currentTime}
            onSeek={isPlayerReady ? handleSeek : undefined}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3 pc-bevel-inset p-2">
            <div>
              <span className="block text-[10px] uppercase opacity-75">Current</span>
              <span className="font-mono font-semibold">{formatDuration(currentTime)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase opacity-75">Start</span>
              <span className="font-mono font-semibold">{draftStart}s ({formatDuration(draftStart)})</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase opacity-75">End</span>
              <span className="font-mono font-semibold">{draftEnd}s ({formatDuration(draftEnd)})</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase opacity-75">Clip</span>
              <span className="font-mono font-semibold">{clipDuration}s</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              type="button"
              disabled={!isPlayerReady}
              onClick={handleSetStart}
            >
              Set start from current
            </Button>
            <Button
              type="button"
              disabled={!isPlayerReady}
              onClick={handleSetEnd}
            >
              Set end from current
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!isPlayerReady || !isValid}
              onClick={handlePreview}
            >
              {isPreviewing ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop preview
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Preview
                </>
              )}
            </Button>
          </div>

          {!isValid && (
            <p className="text-xs text-pc-warning mb-3">
              Clip must be at least {MIN_CLIP_SECONDS} seconds (end ≥ start + {MIN_CLIP_SECONDS}).
            </p>
          )}
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!hasVideo || !isValid || !isPlayerReady}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </PcModal>
  );
};
