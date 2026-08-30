import React from "react";
import { Link } from "react-router-dom";
import { Button, Overlay, Window } from "@miquelt9/pc-ui";
import { AlertTriangle, Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { BackButton } from "./BackButton";
import { InvalidTrackEntry } from "../../lib/youtube/playabilityGate";
import { BatchValidationProgress } from "../../lib/youtube/validator";

interface PlayabilityGateOverlayProps {
  deckId: string;
  context: "host" | "cards";
  isChecking: boolean;
  progress: BatchValidationProgress | null;
  invalidTracks: InvalidTrackEntry[];
  onRetry?: () => void;
}

export const PlayabilityGateOverlay: React.FC<PlayabilityGateOverlayProps> = ({
  deckId,
  context,
  isChecking,
  progress,
  invalidTracks,
  onRetry,
}) => {
  const isBlocked = isChecking || invalidTracks.length > 0;

  if (!isBlocked) return null;

  const showCheckingOnly = isChecking && invalidTracks.length === 0;

  const title = context === "host" ? "Cannot Start Game" : "Cannot Print Cards";
  const subtitle =
    context === "host"
      ? "All songs must be playable before starting the game."
      : "All songs must be playable before printing or exporting bingo cards.";

  return (
    <Overlay className="print:hidden">
      <Window
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {title}
          </span>
        }
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {showCheckingOnly ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <div>
                <p className="font-bold">Checking audio compatibility...</p>
                {progress ? (
                  <p className="mt-1 text-muted">
                    {progress.completed} / {progress.total} songs checked
                    {progress.currentTrackTitle ? ` · ${progress.currentTrackTitle}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-muted">Verifying YouTube embed permissions...</p>
                )}
              </div>
            </div>
            {progress && progress.total > 0 && (
              <div className="w-full h-2 pc-bevel-inset overflow-hidden">
                <div
                  className="h-full bg-[var(--pc-titlebar-bg)] transition-all"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {isChecking && (
              <div className="flex items-center gap-2 p-2 pc-bevel-inset text-muted">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  Still checking remaining songs
                  {progress ? ` (${progress.completed} / ${progress.total})` : "..."}
                </span>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 pc-bevel-outset border-l-4 border-pc-warning bg-pc-warning">
              <AlertTriangle className="w-5 h-5 text-pc-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-pc-warning">{subtitle}</p>
                <p className="text-pc-warning mt-1 opacity-90">
                  {invalidTracks.length} song{invalidTracks.length === 1 ? "" : "s"} cannot be played
                  in the app. Fix them in the Deck Editor before continuing.
                </p>
              </div>
            </div>

            <div className="pc-bevel-inset p-2 max-h-48 overflow-y-auto space-y-1">
              {invalidTracks.slice(0, 12).map((entry) => (
                <div key={entry.track.id} className="flex items-start gap-2 py-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-pc-warning shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{entry.track.title}</p>
                    <p className="text-[11px] truncate">{entry.track.artist}</p>
                    <p className="text-[10px] text-muted mt-0.5">{entry.reason}</p>
                  </div>
                </div>
              ))}
              {invalidTracks.length > 12 && (
                <p className="text-[10px] text-muted pt-1">
                  + {invalidTracks.length - 12} more problem song{invalidTracks.length - 12 === 1 ? "" : "s"}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Link
                to={`/deck/${deckId}?filter=blocked`}
                className="pc-button pc-button--primary"
              >
                Fix in Deck Editor
              </Link>
              {onRetry && (
                <Button type="button" onClick={onRetry}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-check All Songs
                </Button>
              )}
              <BackButton
                fallbackTo={`/deck/${deckId}`}
                fallbackLabel="Deck editor"
              />
            </div>
          </div>
        )}
      </Window>
    </Overlay>
  );
};
