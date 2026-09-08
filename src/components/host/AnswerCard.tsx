import React from "react";
import { Button, Window } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { Eye, EyeOff, ExternalLink, Music2, AlertTriangle, AlertCircle } from "lucide-react";
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
  /** 1-based deck-order song number; shown only when revealed. */
  songNumber?: number | null;
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
  songNumber = null,
  errorMessage,
  fill = false,
  className = "",
}) => {
  const bodyClassName = fill
    ? "host-answer-card-body"
    : "relative flex flex-col min-h-[200px]";

  const emptyStateClassName = fill
    ? "host-answer-card-empty"
    : "py-8 text-center flex flex-col items-center justify-center min-h-[200px]";

  if (!track) {
    return (
      <Window fill={fill} className={className} title="Current Call">
        <div className={emptyStateClassName}>
          <Music2 className="w-10 h-10 mb-3" />
          <h3 className="text-xl font-bold">No Song Called Yet</h3>
          <p className="text-sm max-w-sm mt-1">
            Use <strong>Call Next Song</strong> to start the round.
          </p>
        </div>
      </Window>
    );
  }

  const youtubeId = track.media?.provider === "youtube" ? track.media.id : null;
  const providerUrl = track.media?.provider === "deezer"
    ? track.media.providerUrl
    : youtubeId ? getYoutubeWatchUrl(youtubeId, track.startTime) : null;
  const providerLabel = track.media?.provider === "deezer" ? "Deezer" : "YouTube";
  const thumbUrl =
    track.albumArtUrl ||
    (youtubeId ? getYoutubeThumbnailUrl(youtubeId, "hqdefault") : "");

  const clipDuration = track.endTime - track.startTime;

  return (
    <Window fill={fill} className={className} title={`Call #${callNumber}`}>
      <div className={bodyClassName}>
        <div className="host-answer-card-toolbar shrink-0">
          <div className="host-answer-card-progress h-2 pc-bevel-inset overflow-hidden flex-1 min-w-0">
            <div
              className="h-full bg-[var(--pc-titlebar-bg)] transition-all duration-100"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
          <Button type="button" onClick={isRevealed ? onHide : onReveal} className="shrink-0">
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

        {errorMessage && (
          <div className="p-2 pc-bevel-inset border-l-4 border-red-500 bg-red-500/10 text-xs flex flex-col gap-2 shrink-0">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-pc-error shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-pc-error">Audio Playback Restricted</p>
                <p className="text-[11px] text-pc-error mt-0.5">
                  This {providerLabel} source is not available for in-game playback. You can open it directly in a new tab:
                </p>
              </div>
            </div>
            {providerUrl && (
              <div className="flex justify-end">
                <a
                  href={providerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pc-button shrink-0 text-xs inline-flex items-center gap-1.5 font-bold w-full sm:w-auto justify-center"
                  title={`Open ${providerLabel} source in new tab`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in {providerLabel}</span>
                </a>
              </div>
            )}
          </div>
        )}

        {(!track.media || (track.media.provider === "deezer" && !track.media.previewUrl)) && (
          <div className="p-2 pc-bevel-inset text-xs text-pc-warning flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{track.media?.provider === "deezer" ? "This track does not have a usable Deezer preview." : "This track does not have a linked playback source."}</span>
          </div>
        )}

        <div className="host-answer-card-content">
          <div className="host-answer-card-main">
            <div className="host-answer-card-thumb relative">
              {!isRevealed ? (
                <div className="host-answer-card-thumb-inner pc-bevel-inset flex items-center justify-center select-none">
                  <span className="text-5xl font-black">?</span>
                </div>
              ) : thumbUrl ? (
                <div className="host-answer-card-thumb-inner pc-bevel-inset overflow-hidden bg-black/5">
                  <img src={thumbUrl} alt={track.title} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="host-answer-card-thumb-inner pc-bevel-inset flex items-center justify-center">
                  <Music2 className="w-12 h-12" />
                </div>
              )}
              {isRevealed && providerUrl && (
                <a
                  href={providerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pc-button absolute bottom-1 right-1"
                  title={`Open ${providerLabel} source in new tab`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="host-answer-card-details min-w-0">
              <p
                className={`host-answer-card-song-number text-sm font-black tabular-nums mb-0.5 ${
                  isRevealed && songNumber != null ? "text-muted" : "invisible"
                }`}
                aria-hidden={!(isRevealed && songNumber != null)}
              >
                {isRevealed && songNumber != null ? `Song #${songNumber}` : "Song #00"}
              </p>
              <h2 className="text-xl font-extrabold leading-tight truncate">
                {isRevealed ? track.title : "Mystery Track Playing…"}
              </h2>
              <p className="text-sm font-medium truncate">
                {isRevealed ? track.artist : "Artist & title hidden"}
              </p>
              <p
                className={`host-answer-card-album text-[11px] text-muted truncate mt-0.5 ${
                  !isRevealed || track.album ? "" : "invisible"
                }`}
                aria-hidden={isRevealed && !track.album}
              >
                {!isRevealed
                  ? "Players are listening to identify the song."
                  : track.album
                    ? `Album: ${track.album}`
                    : "Album placeholder"}
              </p>
            </div>
            <div className="host-answer-card-meta shrink-0">
              <span className="px-2 py-1 text-xs font-mono pc-bevel-inset whitespace-nowrap">
                Clip: {track.startTime}s – {track.endTime}s ({clipDuration}s)
              </span>
              <span
                className={`px-2 py-1 text-xs font-mono pc-bevel-inset whitespace-nowrap ${
                  isPlaying ? "" : "invisible"
                }`}
                aria-hidden={!isPlaying}
              >
                {isPlaying ? `${remainingTime.toFixed(1)}s left` : "0.0s left"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
};
