import React from "react";
import { Button, Window } from "@miquelt9/pc-ui";
import { Shuffle, SlidersHorizontal, Music2, ChevronDown, Monitor } from "lucide-react";
import { NowPlayingControls } from "../player/NowPlayingControls";
import { PlayerPlaybackState } from "../../lib/player/player";
import { getTrackProvider, getTrackSourceId } from "../../lib/music/providers";
import { Track } from "../../types/deck";
import { useIsMobile } from "../../hooks/useMediaQuery";

function buildDisplayPlayerState(
  currentTrack: Track,
  playerState: PlayerPlaybackState | null,
  isRevealed: boolean
): PlayerPlaybackState {
  let base: PlayerPlaybackState;

  if (playerState?.currentClip?.trackId === currentTrack.id) {
    base = playerState;
  } else {
    const clipDuration = Math.max(0, currentTrack.endTime - currentTrack.startTime);
    base = {
      isReady: playerState?.isReady ?? false,
      state: "unstarted",
      currentClip: {
        provider: getTrackProvider(currentTrack),
        sourceId: getTrackSourceId(currentTrack) || "",
        previewUrl:
          currentTrack.media?.provider === "deezer"
            ? currentTrack.media.previewUrl ?? undefined
            : undefined,
        startTime: currentTrack.startTime,
        endTime: currentTrack.endTime,
        trackId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist,
      },
      currentTime: currentTrack.startTime,
      duration: clipDuration,
      progress: 0,
      remainingTime: clipDuration,
      volume: playerState?.volume ?? 100,
      isMuted: playerState?.isMuted ?? false,
      errorMessage: null,
      activePlayerElementId: playerState?.activePlayerElementId ?? null,
      visiblePlayerElementId: playerState?.visiblePlayerElementId ?? null,
    };
  }

  if (isRevealed || !base.currentClip) {
    return base;
  }

  return {
    ...base,
    currentClip: {
      ...base.currentClip,
      title: "Mystery track playing…",
      artist: "Artist & title hidden",
    },
  };
}

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
  currentTrack: Track | null;
  remainingCount: number;
  totalCount: number;
  calledCount: number;
  autoCallNextOnEnd: boolean;
  onToggleAutoCallNext: () => void;
  autoRevealOnEnd: boolean;
  onToggleAutoReveal: () => void;
  crossfadeOverlapMs: number;
  onCrossfadeOverlapChange: (ms: number) => void;
  onOpenDisplay: () => void;
  gameStarted: boolean;
  disabled?: boolean;
  isRevealed?: boolean;
  /** When false, hide YouTube video toggle and related copy (e.g. Deezer Host). */
  supportsVideoPreview?: boolean;
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
  currentTrack,
  remainingCount,
  totalCount,
  calledCount,
  autoCallNextOnEnd,
  onToggleAutoCallNext,
  autoRevealOnEnd,
  onToggleAutoReveal,
  crossfadeOverlapMs,
  onCrossfadeOverlapChange,
  onOpenDisplay,
  gameStarted,
  disabled = false,
  isRevealed = true,
  supportsVideoPreview = true,
}) => {
  const isMobile = useIsMobile();
  const isDeckFinished = remainingCount === 0 && totalCount > 0 && calledCount > 0;
  const progressPercent = totalCount > 0 ? (calledCount / totalCount) * 100 : 0;

  const handlePlayPause = () => {
    if (!currentTrack?.media) return;

    if (isPlaying) {
      onTogglePlayPause();
    } else if (playerState?.state === "paused" && playerState?.currentClip) {
      onTogglePlayPause();
    } else {
      onReplayCurrent();
    }
  };

  const hasPlayableTrack = Boolean(currentTrack?.media && (currentTrack.media.provider === "youtube" || currentTrack.media.previewUrl));

  const advancedOptions = (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
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
                When on, starts the next song automatically. When off, you call the next song
                manually.
              </span>
            </span>
          </label>

          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRevealOnEnd}
              onChange={onToggleAutoReveal}
              disabled={disabled}
            />
            <span className="font-medium">
              Auto-reveal answer when snippet ends
              <span className="block text-[10px] font-normal opacity-80 mt-0.5">
                When on, reveals the answer a few seconds before the clip ends. When off, you
                control reveal timing.
              </span>
            </span>
          </label>
        </div>

        <div
          className={`shrink-0 w-full sm:w-40 ${gameStarted ? "opacity-60" : ""}`}
          title="How long outgoing and incoming snippets overlap. Locked once the game starts."
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium">Crossfade</span>
            <span className="font-mono text-[10px]">{crossfadeOverlapMs} ms</span>
          </div>
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={crossfadeOverlapMs}
            onChange={(e) => onCrossfadeOverlapChange(Number(e.target.value))}
            disabled={disabled || gameStarted}
            className="w-full cursor-pointer"
            aria-label="Crossfade overlap duration in milliseconds"
          />
          {gameStarted ? (
            <p className="text-[10px] opacity-80 mt-1">Locks when game starts</p>
          ) : (
            <p className="text-[10px] opacity-80 mt-1">Locks once the first song is called</p>
          )}
        </div>
      </div>

      <div className="inline-flex items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Non-repeating randomized shuffle bag</span>
      </div>
    </div>
  );

  return (
    <Window title="Host Controls" className="host-controls-window">
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

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={onCallNext}
          disabled={disabled || isDeckFinished}
          className="py-3 flex-1 min-w-0"
        >
          <Shuffle className="w-5 h-5" />
          {isDeckFinished
            ? "All Songs Called!"
            : calledCount === 0
              ? isMobile
                ? "Start & Call First"
                : "Start Game & Call First Song"
              : "Call Next Song"}
        </Button>
        <Button type="button" onClick={onOpenDisplay} className="py-3 sm:shrink-0">
          <Monitor className="w-4 h-4" />
          {isMobile ? "Project to TV" : "Open display window"}
        </Button>
      </div>
      <p className="text-[10px] opacity-80 mt-2">
        {supportsVideoPreview
          ? "Prefer Display for projection. Host Video is off by default so players cannot see titles."
          : "Prefer Display for projection. Audio plays on this device; open Display for the room screen."}
      </p>

      <div
        className={`host-now-playing-slot mt-4 pt-3 border-t border-[var(--pc-border)] ${
          isMobile ? "host-now-playing-slot--compact" : ""
        }`}
      >
        {!isMobile && <p className="text-xs font-semibold mb-2">Now Playing</p>}
        <div className="host-now-playing-slot__body">
          {hasPlayableTrack && currentTrack ? (
            <NowPlayingControls
              playerState={buildDisplayPlayerState(currentTrack, playerState, isRevealed)}
              onPlayPause={handlePlayPause}
              onStop={onStop}
              onToggleMute={onToggleMute}
              onVolumeChange={onVolumeChange}
              onToggleVideo={onToggleVideo}
              showVideo={showVideo}
              showVideoToggle={supportsVideoPreview && !isMobile}
              compact={isMobile}
            />
          ) : currentTrack ? (
            <div className="host-now-playing-placeholder">
              <Music2 className="w-5 h-5 shrink-0 opacity-60" />
              <div className="min-w-0">
                {isRevealed ? (
                  <>
                    <p className="font-bold text-sm truncate">{currentTrack.title}</p>
                    <p className="text-xs text-muted truncate">{currentTrack.artist}</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm truncate">Mystery track playing…</p>
                    <p className="text-xs text-muted truncate">Artist &amp; title hidden</p>
                  </>
                )}
                <p className="text-[11px] text-pc-warning mt-0.5">
                  No{" "}
                  {currentTrack?.media?.provider === "deezer" ? "Deezer preview" : "YouTube video"}{" "}
                  linked for this track
                </p>
              </div>
            </div>
          ) : (
            <div className="host-now-playing-placeholder host-now-playing-placeholder--empty">
              <Music2 className="w-5 h-5 shrink-0 opacity-40" />
              <p className="text-xs text-muted">No song playing yet — call a song to start</p>
            </div>
          )}
        </div>
      </div>

      {isMobile ? (
        <details className="host-advanced-details mt-4 pt-3 border-t border-[var(--pc-border)]">
          <summary className="host-advanced-details__summary">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Advanced
            <ChevronDown className="w-3.5 h-3.5 host-advanced-details__chevron" aria-hidden="true" />
          </summary>
          <div className="host-advanced-details__body">{advancedOptions}</div>
        </details>
      ) : (
        <div className="mt-4 pt-3 border-t border-[var(--pc-border)]">{advancedOptions}</div>
      )}
    </Window>
  );
};
