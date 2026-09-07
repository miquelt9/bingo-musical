import React from "react";
import { Button } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { formatDuration } from "../../lib/youtube/search";
import { PcModal } from "../ui/PcModal";
import { Loader2, Pause, Play, Square } from "lucide-react";
import { ClipTimeline } from "./ClipTimeline";
import { MIN_CLIP_SECONDS, useClipTimestampEditor } from "../../hooks/useClipTimestampEditor";

const ACTION_BTN = "min-h-9 h-9";

interface ClipTimestampModalProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
  onTrackMediaUpdated?: (updatedTrack: Track) => void;
}

export const ClipTimestampModal: React.FC<ClipTimestampModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
  onTrackMediaUpdated,
}) => {
  const editor = useClipTimestampEditor({ track, isOpen, onTrackMediaUpdated });

  const handleSave = () => {
    const updated = editor.buildUpdatedTrack();
    if (!updated) return;
    onSave(updated);
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

      {!editor.hasVideo ? (
        <p className="text-sm mb-4">{track.media?.provider === "deezer" ? "This Deezer track has no preview to edit." : "Link a YouTube video before editing clip timestamps."}</p>
      ) : (
        <>
          <div className={`relative ${track.media?.provider === "deezer" ? "w-full min-h-[4.5rem]" : "aspect-video"} pc-bevel-inset overflow-hidden bg-black mb-3`}>
            <div id={editor.elementId} className="absolute inset-0" />
            {(editor.isLoadingPlayer || !editor.isPlayerReady) && !editor.playerError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            )}
            {editor.playerError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-pc-error">
                {editor.playerError}
              </div>
            )}
            {track.media?.provider === "deezer" && editor.isPlayerReady && !editor.playerError && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs uppercase tracking-wide text-white/70">Deezer preview</span>
              </div>
            )}
          </div>

          <ClipTimeline
            duration={editor.videoDuration}
            start={editor.draftStart}
            end={editor.draftEnd}
            current={editor.currentTime}
            onSeek={editor.isPlayerReady ? editor.handleSeek : undefined}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3 pc-bevel-inset p-2">
            <div>
              <span className="block text-[10px] uppercase text-muted">Current</span>
              <span className="font-mono font-semibold">{formatDuration(editor.currentTime)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-muted">Start</span>
              <span className="font-mono font-semibold">{editor.draftStart}s ({formatDuration(editor.draftStart)})</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-muted">End</span>
              <span className="font-mono font-semibold">{editor.draftEnd}s ({formatDuration(editor.draftEnd)})</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-muted">Clip</span>
              <span className="font-mono font-semibold">{editor.clipDuration}s</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              type="button"
              className={ACTION_BTN}
              disabled={!editor.isPlayerReady}
              onClick={editor.handleSetStart}
            >
              Set start from current
            </Button>
            <Button
              type="button"
              className={ACTION_BTN}
              disabled={!editor.isPlayerReady}
              onClick={editor.handlePlayPause}
            >
              {editor.isTransportPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Play
                </>
              )}
            </Button>
            <Button
              type="button"
              className={ACTION_BTN}
              disabled={!editor.isPlayerReady}
              onClick={editor.handleSetEnd}
            >
              Set end from current
            </Button>
            <Button
              type="button"
              variant="primary"
              className={ACTION_BTN}
              disabled={!editor.isPlayerReady || !editor.isValid}
              onClick={editor.handlePreview}
            >
              {editor.isPreviewing ? (
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

          {!editor.isValid && (
            <p className="text-xs text-pc-warning mb-3">
              Clip must be at least {MIN_CLIP_SECONDS} seconds (end ≥ start + {MIN_CLIP_SECONDS}).
            </p>
          )}
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" className={ACTION_BTN} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          className={ACTION_BTN}
          disabled={!editor.hasVideo || !editor.isValid || !editor.isPlayerReady}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </PcModal>
  );
};
