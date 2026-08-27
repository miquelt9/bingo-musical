import React, { useState, useEffect } from "react";
import { Button, Input } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { parseYoutubeVideoId, getYoutubeThumbnailUrl } from "../../lib/youtube/parseUrl";
import { checkVideoEmbeddable, EmbedValidationResult } from "../../lib/youtube/validator";
import { PcModal } from "../ui/PcModal";
import { Check, AlertCircle, PlaySquare, Loader2, AlertTriangle } from "lucide-react";

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
  const [isCheckingAudio, setIsCheckingAudio] = useState(false);
  const [audioStatus, setAudioStatus] = useState<EmbedValidationResult | null>(null);

  const parsedId = parseYoutubeVideoId(inputValue);
  const thumbUrl = parsedId ? getYoutubeThumbnailUrl(parsedId, "hqdefault") : null;

  useEffect(() => {
    if (!isOpen || !parsedId) {
      setAudioStatus(null);
      setIsCheckingAudio(false);
      return;
    }

    let isSubscribed = true;
    setIsCheckingAudio(true);
    setAudioStatus(null);

    const timer = setTimeout(async () => {
      try {
        const res = await checkVideoEmbeddable(parsedId);
        if (isSubscribed) {
          setAudioStatus(res);
        }
      } catch {
        // ignore check errors
      } finally {
        if (isSubscribed) {
          setIsCheckingAudio(false);
        }
      }
    }, 300);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [parsedId, isOpen]);

  if (!isOpen) return null;

  const handleSearchYoutube = () => {
    const query = encodeURIComponent(`${track.artist} - ${track.title} official audio`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
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
    <PcModal
      title={`Manual YouTube Link — ${track.title}`}
      onClose={onClose}
      className="max-w-2xl"
    >
      <p className="text-sm mb-3">{track.artist}</p>
      <div className="mb-4 pc-bevel-inset p-3 flex items-center justify-between gap-3">
        <div className="text-xs">Search YouTube in a new tab, copy the link, and paste it below:</div>
        <Button type="button" onClick={handleSearchYoutube}>
          <PlaySquare className="w-3.5 h-3.5" />
          Search YouTube
        </Button>
      </div>
      <form onSubmit={handleSave} className="space-y-3">
        <label className="block text-xs font-bold">
          YouTube Video URL or Video ID
          <Input
            type="text"
            className="w-full mt-1 font-mono"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            autoFocus
          />
        </label>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </p>
        )}
        {parsedId && thumbUrl && (
          <div className="p-2 pc-bevel-inset flex items-start gap-3">
            <img src={thumbUrl} alt="YouTube Preview" className="w-24 h-16 object-cover shrink-0 pc-bevel-inset" />
            <div className="text-xs space-y-1">
              <span className="inline-flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" />
                Valid Video ID ({parsedId})
              </span>

              {isCheckingAudio && (
                <p className="flex items-center gap-1.5 text-xs opacity-75">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Testing video playback...</span>
                </p>
              )}

              {audioStatus && audioStatus.embeddable && (
                <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Audio verified (playable in game)</span>
                </p>
              )}

              {audioStatus && !audioStatus.embeddable && (
                <div className="text-pc-warning">
                  <p className="flex items-center gap-1 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Playback restricted by owner</span>
                  </p>
                  <p className="text-[11px] mt-0.5">
                    The video owner has restricted playback outside YouTube. We recommend searching for an official audio or lyric video instead.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save Track
          </Button>
        </div>
      </form>
    </PcModal>
  );
};
