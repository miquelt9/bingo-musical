import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { InvalidTrackEntry } from "../../lib/youtube/playabilityGate";
import { BatchValidationProgress } from "../../lib/youtube/validator";

interface CardsPlayabilityBannerProps {
  deckId: string;
  isChecking: boolean;
  progress: BatchValidationProgress | null;
  invalidTracks: InvalidTrackEntry[];
}

export const CardsPlayabilityBanner: React.FC<CardsPlayabilityBannerProps> = ({
  deckId,
  isChecking,
  progress,
  invalidTracks,
}) => {
  const showChecking = isChecking && invalidTracks.length === 0;
  const showWarning = invalidTracks.length > 0;

  if (!showChecking && !showWarning) return null;

  return (
    <div className="space-y-2 print:hidden">
      {showChecking && (
        <div className="flex items-center gap-2 p-2 pc-bevel-inset text-xs text-muted">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            Checking song compatibility
            {progress
              ? ` (${progress.completed} / ${progress.total})`
              : "..."}
          </span>
        </div>
      )}

      {showWarning && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 pc-bevel-outset border-l-4 border-pc-warning bg-pc-warning text-xs">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-pc-warning shrink-0 mt-0.5" />
            <p className="text-pc-warning">
              <span className="font-bold">
                {invalidTracks.length} song{invalidTracks.length === 1 ? "" : "s"} may not play
                during hosting.
              </span>{" "}
              You can still print cards — fix them in the Editor before starting a game.
            </p>
          </div>
          <Link
            to={`/deck/${deckId}?filter=blocked`}
            className="pc-button pc-button--primary shrink-0 self-start sm:self-center"
          >
            Fix in Deck Editor
          </Link>
        </div>
      )}
    </div>
  );
};
