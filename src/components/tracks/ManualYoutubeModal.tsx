import React, { useState } from "react";
import { Track } from "../../types/deck";
import { parseYoutubeVideoId, getYoutubeThumbnailUrl } from "../../lib/youtube/parseUrl";
import { X, Check, AlertCircle, PlaySquare } from "lucide-react";

interface ManualYoutubeModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export const ManualYoutubeModal: React.FC<ManualYoutubeModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const [inputValue, setInputValue] = useState(
    track.youtubeVideoId ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}` : ""
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const parsedId = parseYoutubeVideoId(inputValue);
  const thumbUrl = parsedId ? getYoutubeThumbnailUrl(parsedId, "hqdefault") : null;

  const handleSearchYoutube = () => {
    const query = encodeURIComponent(`${track.artist} - ${track.title} official audio`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      // Clear video
      onSave({
        ...track,
        youtubeVideoId: null,
        matchStatus: "pending",
      });
      onClose();
      return;
    }

    if (!parsedId) {
      setError("Please enter a valid YouTube URL or 11-character video ID.");
      return;
    }

    onSave({
      ...track,
      youtubeVideoId: parsedId,
      matchStatus: "manual",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-150 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Manual YouTube Link
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">{track.title}</h3>
            <p className="text-sm text-zinc-400">{track.artist}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Search Helper */}
        <div className="mb-6 p-4 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-300">
            Search YouTube in a new tab, copy the link, and paste it below:
          </div>
          <button
            type="button"
            onClick={handleSearchYoutube}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold border border-red-500/30 transition-all shrink-0 active:scale-95"
          >
            <PlaySquare className="w-3.5 h-3.5" />
            <span>Search YouTube</span>
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              YouTube Video URL or Video ID
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or dQw4w9WgXcQ"
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm text-white placeholder-zinc-500 transition-colors outline-none font-mono"
              autoFocus
            />
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 mt-2">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{error}</span>
              </p>
            )}
          </div>

          {/* Thumbnail Preview */}
          {parsedId && thumbUrl && (
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 flex items-center gap-4">
              <img
                src={thumbUrl}
                alt="YouTube Preview"
                className="w-24 h-16 rounded-lg object-cover border border-zinc-700 shrink-0"
              />
              <div className="text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold mb-0.5">
                  <Check className="w-3 h-3 stroke-[3]" />
                  Valid Video ID ({parsedId})
                </span>
                <p className="text-zinc-400 text-[11px]">
                  Thumbnail loaded successfully from YouTube.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              Save Track
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
