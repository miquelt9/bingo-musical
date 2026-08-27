import React from "react";
import { Button, Window } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { Eye, EyeOff, ExternalLink, Music2, Disc3, AlertTriangle, AlertCircle } from "lucide-react";
import { getYoutubeThumbnailUrl, getYoutubeWatchUrl } from "../../lib/youtube/parseUrl";

interface AnswerCardProps {
  track: Track | null;
  isRevealed: boolean;
  onReveal: () => void;
  onHide: () => void;
  isPlaying: boolean;
  progress: number;
  remainingTime: number;
  callNumber: number;
  errorMessage?: string | null;
  fill?: boolean;
  className?: string;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({
  track,
  isRevealed,
  onReveal,
  onHide,
  isPlaying,
  progress,
  remainingTime,
  callNumber,
  errorMessage,
  fill = false,
  className = "",
}) => {
  const bodyClassName = fill
    ? "host-answer-card-body relative"
    : "relative flex flex-col min-h-[280px]";

  const emptyStateClassName = fill
    ? "flex flex-1 flex-col items-center justify-center text-center py-10"
    : "py-10 text-center flex flex-col items-center justify-center min-h-[280px]";

  if (!track) {
    return (
      <Window fill={fill} className={className} title="Current Call">
        <div className={emptyStateClassName}>
          <Music2 className="w-10 h-10 mb-3" />
          <h3 className="text-xl font-bold">No Song Called Yet</h3>
          <p className="text-sm max-w-sm mt-1">
            Click the <strong>Call Next Song</strong> button below or press{" "}
            <kbd className="pc-bevel-inset px-1.5 py-0.5 text-xs font-mono">Space</kbd> to start the round.
          </p>
        </div>
      </Window>
    );
  }

  const thumbUrl =
    track.albumArtUrl ||
    (track.youtubeVideoId ? getYoutubeThumbnailUrl(track.youtubeVideoId, "hqdefault") : "");

  return (
    <Window fill={fill} className={className} title={`Call #${callNumber}`}>
      <div className={bodyClassName}>
        <div className="h-2 pc-bevel-inset overflow-hidden shrink-0">
          <div
            className="h-full bg-[var(--pc-titlebar-bg)] transition-all duration-100"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>

        <div className="flex items-center mt-3 mb-4 shrink-0">
          <span className="inline-flex items-center gap-2 text-xs font-semibold">
            <Disc3 className={`w-3.5 h-3.5 ${isPlaying ? "animate-spin" : ""}`} />
            Call #{callNumber}
          </span>
        </div>

        {errorMessage && (
          <div className="p-3 pc-bevel-inset border-l-4 border-red-500 bg-red-500/10 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 shrink-0">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-700 dark:text-red-400">Audio Playback Restricted</p>
                <p className="text-[11px] text-red-600 dark:text-red-300 mt-0.5">
                  The video owner restricted this song from playing outside YouTube. You can play it directly in a new tab:
                </p>
              </div>
            </div>
            {track.youtubeVideoId && (
              <a
                href={getYoutubeWatchUrl(track.youtubeVideoId, track.startTime)}
                target="_blank"
                rel="noreferrer"
                className="pc-button shrink-0 text-xs inline-flex items-center gap-1.5 font-bold"
                title="Open video directly on YouTube in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Play in YouTube ({track.startTime}s)</span>
              </a>
            )}
          </div>
        )}

        {!track.youtubeVideoId && (
          <div className="p-2 pc-bevel-inset text-xs text-pc-warning flex items-center gap-2 mb-4 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>This track does not have a linked YouTube video.</span>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!isRevealed ? (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="relative shrink-0">
                <div className="w-36 h-36 pc-bevel-inset flex flex-col items-center justify-center select-none">
                  <span className="text-5xl font-black">?</span>
                </div>
              </div>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <span className="text-xs font-semibold">Mystery Song</span>
                <h2 className="text-2xl font-extrabold mt-1 leading-tight">Mystery Track Playing...</h2>
                <p className="text-lg font-medium mt-1">Artist & Title Hidden</p>
                <p className="text-xs mt-1">
                  Players are listening to identify the song. Reveal when ready or wait for playback to end.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 text-xs font-mono pc-bevel-inset">
                    Clip: {track.startTime}s - {track.endTime}s ({track.endTime - track.startTime}s)
                  </span>
                  {isPlaying && (
                    <span className="text-xs font-mono pc-bevel-inset px-2 py-1">
                      Playing snippet ({remainingTime.toFixed(1)}s left)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <div className="relative shrink-0">
                {thumbUrl ? (
                  <img src={thumbUrl} alt={track.title} className="w-36 h-36 object-cover pc-bevel-inset" />
                ) : (
                  <div className="w-36 h-36 pc-bevel-inset flex items-center justify-center">
                    <Music2 className="w-12 h-12" />
                  </div>
                )}
                {track.youtubeVideoId && (
                  <a
                    href={getYoutubeWatchUrl(track.youtubeVideoId, track.startTime)}
                    target="_blank"
                    rel="noreferrer"
                    className="pc-button absolute bottom-1 right-1"
                    title="Open YouTube video in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <span className="text-xs font-semibold">Revealed Song</span>
                <h2 className="text-2xl font-extrabold mt-1 leading-tight">{track.title}</h2>
                <p className="text-lg font-medium mt-1">{track.artist}</p>
                {track.album && <p className="text-xs mt-1">Album: {track.album}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="px-2 py-1 text-xs font-mono pc-bevel-inset">
                    Clip: {track.startTime}s - {track.endTime}s ({track.endTime - track.startTime}s)
                  </span>
                  {isPlaying && (
                    <span className="text-xs font-mono pc-bevel-inset px-2 py-1">
                      Playing snippet ({remainingTime.toFixed(1)}s left)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-3 shrink-0">
          <Button type="button" onClick={isRevealed ? onHide : onReveal}>
            {isRevealed ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                Hide Answer
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                Reveal Answer
              </>
            )}
          </Button>
        </div>
      </div>
    </Window>
  );
};
