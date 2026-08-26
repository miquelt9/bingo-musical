import React from "react";
import { Track } from "../../types/deck";
import { Eye, EyeOff, Sparkles, ExternalLink, Music2, Disc3 } from "lucide-react";
import confetti from "canvas-confetti";
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
}) => {
  const triggerConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#22c55e", "#eab308", "#3b82f6", "#ec4899", "#a855f7"],
    });
  };

  if (!track) {
    return (
      <div className="bg-zinc-900/60 border border-dashed border-zinc-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[360px]">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 text-zinc-500 flex items-center justify-center mb-4">
          <Music2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-zinc-300">No Song Called Yet</h3>
        <p className="text-sm text-zinc-500 max-w-sm mt-1">
          Click the <strong className="text-emerald-400">Call Next Song</strong> button below or press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs font-mono">Space</kbd> to start the round.
        </p>
      </div>
    );
  }

  const thumbUrl =
    track.albumArtUrl ||
    (track.youtubeVideoId ? getYoutubeThumbnailUrl(track.youtubeVideoId, "hqdefault") : "");

  return (
    <div className="relative bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl overflow-hidden transition-all">
      {/* Progress bar across top of card */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-100"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      {/* Header Info */}
      <div className="flex items-center justify-between mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/90 text-xs font-semibold text-zinc-300 border border-zinc-700/50">
          <Disc3 className={`w-3.5 h-3.5 text-emerald-400 ${isPlaying ? "animate-spin" : ""}`} />
          <span>Call #{callNumber}</span>
        </div>

        <div className="flex items-center gap-2">
          {isPlaying && (
            <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
              Playing snippet ({remainingTime.toFixed(1)}s left)
            </span>
          )}

          <button
            type="button"
            onClick={isRevealed ? onHide : onReveal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
          >
            {isRevealed ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                <span>Hide Answer</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Reveal Answer</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Card Content: Mystery Mode vs Revealed Mode */}
      {!isRevealed ? (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          {/* Animated Mystery Icon */}
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-emerald-500/20 via-zinc-800 to-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-950/40">
              <span className="text-5xl font-black text-emerald-400 animate-bounce select-none">
                ?
              </span>
            </div>
            {isPlaying && (
              <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                Live Clip
              </span>
            )}
          </div>

          <h3 className="text-2xl font-bold text-zinc-100">Mystery Track Playing...</h3>
          <p className="text-zinc-400 text-sm mt-1 max-w-md">
            Players are listening to identify the artist and title. The answer will reveal automatically after playback ends or when you click reveal.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onReveal}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 active:scale-95"
            >
              <Eye className="w-4 h-4" />
              <span>Reveal Title & Artist Now</span>
            </button>
          </div>
        </div>
      ) : (
        /* Revealed Answer State */
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Album Art / Thumbnail */}
            <div className="relative group shrink-0">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={track.title}
                  className="w-36 h-36 rounded-2xl object-cover shadow-xl border border-zinc-700/60"
                />
              ) : (
                <div className="w-36 h-36 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500">
                  <Music2 className="w-12 h-12" />
                </div>
              )}

              {track.youtubeVideoId && (
                <a
                  href={getYoutubeWatchUrl(track.youtubeVideoId, track.startTime)}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-zinc-900/90 text-zinc-300 hover:text-white border border-zinc-700 shadow-md transition-transform group-hover:scale-110"
                  title="Open YouTube video in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* Track Info */}
            <div className="flex-1 text-center sm:text-left">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Revealed Song
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1 leading-tight">
                {track.title}
              </h2>
              <p className="text-lg sm:text-xl font-medium text-zinc-300 mt-1">
                {track.artist}
              </p>

              {track.album && (
                <p className="text-xs text-zinc-500 mt-1">
                  Album: {track.album}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-xs font-mono text-zinc-400 border border-zinc-700/60">
                  Clip: {track.startTime}s - {track.endTime}s ({track.endTime - track.startTime}s)
                </span>

                <button
                  type="button"
                  onClick={triggerConfetti}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-bold transition-all active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Someone Called Bingo! 🎉</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
