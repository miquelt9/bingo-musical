import React from "react";
import { Button, Overlay, Window } from "@miquelt9/pc-ui";
import { Track } from "../../types/deck";
import { formatDuration } from "../../lib/youtube/search";
import { Loader2, Play, Square } from "lucide-react";
import { ClipTimeline } from "./ClipTimeline";
import { MIN_CLIP_SECONDS, useClipTimestampEditor } from "../../hooks/useClipTimestampEditor";

interface ClipTimestampModalMobileProps {
  track: Track;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

export const ClipTimestampModalMobile: React.FC<ClipTimestampModalMobileProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const editor = useClipTimestampEditor({ track, isOpen });

  const handleSave = () => {
    const updated = editor.buildUpdatedTrack();
    if (!updated) return;
    onSave(updated);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Overlay className="print:hidden" onClick={onClose}>
      <Window
        title={`Edit clip — ${track.title}`}
        onClose={onClose}
        className="pc-modal-mobile-sheet w-full max-w-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pc-modal-mobile-sheet__body">
          <p className="text-sm mb-3">{track.artist}</p>

          {!editor.hasVideo ? (
            <p className="text-sm mb-4">Link a YouTube video before editing clip timestamps.</p>
          ) : (
            <>
              <div className="relative aspect-video w-full pc-bevel-inset overflow-hidden bg-black mb-3">
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
              </div>

              <ClipTimeline
                variant="touch"
                duration={editor.videoDuration}
                start={editor.draftStart}
                end={editor.draftEnd}
                current={editor.currentTime}
                onSeek={editor.isPlayerReady ? editor.handleSeek : undefined}
              />

              <div className="flex items-center justify-between gap-2 text-xs mb-4 pc-bevel-inset p-2 font-mono">
                <span>
                  <span className="text-[10px] uppercase text-muted block">Start</span>
                  {formatDuration(editor.draftStart)}
                </span>
                <span className="opacity-50">→</span>
                <span>
                  <span className="text-[10px] uppercase text-muted block">End</span>
                  {formatDuration(editor.draftEnd)}
                </span>
                <span className="opacity-50">·</span>
                <span>
                  <span className="text-[10px] uppercase text-muted block">Clip</span>
                  {formatDuration(editor.clipDuration)}
                </span>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                <Button
                  type="button"
                  className="w-full min-h-[44px]"
                  disabled={!editor.isPlayerReady}
                  onClick={editor.handleSetStart}
                >
                  Set start here
                </Button>
                <Button
                  type="button"
                  className="w-full min-h-[44px]"
                  disabled={!editor.isPlayerReady}
                  onClick={editor.handleSetEnd}
                >
                  Set end here
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full min-h-[44px]"
                  disabled={!editor.isPlayerReady || !editor.isValid}
                  onClick={editor.handlePreview}
                >
                  {editor.isPreviewing ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      Stop preview
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Preview clip
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
        </div>

        <div className="pc-modal-mobile-sheet__footer">
          <Button type="button" className="flex-1 min-h-[44px]" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1 min-h-[44px]"
            disabled={!editor.hasVideo || !editor.isValid || !editor.isPlayerReady}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </Window>
    </Overlay>
  );
};
