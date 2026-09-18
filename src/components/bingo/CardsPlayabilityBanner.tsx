import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  DeckReadiness,
  formatReadinessPrimary,
  formatReadinessSecondary,
} from "../../lib/decks/readiness";
import { InvalidTrackEntry } from "../../lib/youtube/playabilityGate";
import { BatchValidationProgress } from "../../lib/youtube/validator";

interface CardsPlayabilityBannerProps {
  deckId: string;
  isChecking: boolean;
  progress: BatchValidationProgress | null;
  invalidTracks: InvalidTrackEntry[];
  readiness?: DeckReadiness;
  isLoadingDeezerPreviews?: boolean;
  deezerPreviewProgress?: { completed: number; total: number };
}

export const CardsPlayabilityBanner: React.FC<CardsPlayabilityBannerProps> = ({
  deckId,
  isChecking,
  progress,
  invalidTracks,
  readiness,
  isLoadingDeezerPreviews = false,
  deezerPreviewProgress,
}) => {
  const showChecking = (isChecking || isLoadingDeezerPreviews) && invalidTracks.length === 0;
  const showWarning = invalidTracks.length > 0 && !isLoadingDeezerPreviews;

  if (!showChecking && !showWarning) return null;

  return (
    <div className="space-y-2 print:hidden">
      {showChecking && (
        <div className="p-2 pc-bevel-inset text-xs text-muted" role={isLoadingDeezerPreviews ? "status" : undefined} aria-live={isLoadingDeezerPreviews ? "polite" : undefined}>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>
              {isLoadingDeezerPreviews ? "Loading Deezer previews" : "Checking song compatibility"}
              {isLoadingDeezerPreviews
                ? ` (${deezerPreviewProgress?.completed ?? 0} / ${deezerPreviewProgress?.total ?? "…"})`
                : progress
                  ? ` (${progress.completed} / ${progress.total})`
                  : "..."}
            </span>
          </div>
          {isLoadingDeezerPreviews && deezerPreviewProgress && deezerPreviewProgress.total > 0 ? (
            <div
              className="mt-2 w-full h-2 pc-bevel-inset overflow-hidden"
              role="progressbar"
              aria-label="Loading Deezer previews"
              aria-valuemin={0}
              aria-valuemax={deezerPreviewProgress.total}
              aria-valuenow={Math.min(deezerPreviewProgress.total, deezerPreviewProgress.completed)}
            >
              <div
                className="h-full bg-[var(--pc-titlebar-bg)] transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, (deezerPreviewProgress.completed / deezerPreviewProgress.total) * 100))}%` }}
              />
            </div>
          ) : null}
        </div>
      )}

      {showWarning && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 pc-bevel-outset border-l-4 border-pc-warning bg-pc-warning text-xs">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-pc-warning shrink-0 mt-0.5" />
            <p className="text-pc-warning">
              {readiness ? (
                <>
                  <span className="font-bold">{formatReadinessPrimary(readiness)}</span>
                  {formatReadinessSecondary(readiness) ? (
                    <> · {formatReadinessSecondary(readiness)}</>
                  ) : null}
                  {" "}You can still print cards — fix songs in the deck before hosting.
                </>
              ) : (
                <>
                  <span className="font-bold">
                    {invalidTracks.length} song{invalidTracks.length === 1 ? "" : "s"} may not play
                    during hosting.
                  </span>{" "}
                  You can still print cards — fix them in the deck before starting a game.
                </>
              )}
            </p>
          </div>
          <Link
            to={`/deck/${deckId}?filter=blocked`}
            className="pc-button pc-button--primary shrink-0 self-start sm:self-center"
          >
            Fix all songs
          </Link>
        </div>
      )}
    </div>
  );
};
