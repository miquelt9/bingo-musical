import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Sparkles } from "lucide-react";
import { getUnplayableTracks } from "../../lib/youtube/validator";
import { useDeck } from "../../state/DeckContext";
import { useAutoFixBlocked } from "../../hooks/useAutoFixBlocked";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { PcModal } from "../ui/PcModal";

const BLOCKED_DETAIL =
  "Some videos have playback restrictions outside YouTube. Use Auto-Fix to automatically find and replace them with working versions.";

export const BlockedSongsTaskbarNotice: React.FC = () => {
  const { activeDeck } = useDeck();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [modalOpen, setModalOpen] = useState(false);

  const blockedCount = activeDeck ? getUnplayableTracks(activeDeck.tracks).length : 0;

  const { handleAutoFixBlocked, isMatching } = useAutoFixBlocked(activeDeck, {
    onViewProblems: activeDeck
      ? () => navigate(`/deck/${activeDeck.id}?filter=blocked`)
      : undefined,
  });

  if (!activeDeck || blockedCount === 0) return null;

  const title = `${blockedCount} song${blockedCount > 1 ? "s" : ""} cannot play audio in the game`;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className="pc-blocked-songs-badge"
          onClick={() => setModalOpen(true)}
          aria-label={title}
          title={title}
        >
          <AlertTriangle className="pc-blocked-songs-badge-icon" aria-hidden="true" />
          <span className="pc-blocked-songs-badge-count" aria-hidden="true">
            {blockedCount}
          </span>
        </button>
        {modalOpen && (
          <PcModal title="Blocked Songs" onClose={() => setModalOpen(false)}>
            <div className="space-y-4">
              <div>
                <p className="m-0 text-sm font-bold text-pc-warning">{title}</p>
                <p className="m-0 text-sm opacity-90 mt-2">{BLOCKED_DETAIL}</p>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  className="pc-button pc-button--primary w-full sm:w-auto"
                  onClick={() => void handleAutoFixBlocked()}
                  disabled={isMatching}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>{isMatching ? "Auto-fixing..." : "Auto-Fix"}</span>
                </button>
              </div>
            </div>
          </PcModal>
        )}
      </>
    );
  }

  return (
    <div
      className="pc-blocked-songs-notice"
      role="status"
      aria-live="polite"
      title={BLOCKED_DETAIL}
    >
      <AlertTriangle className="pc-blocked-songs-notice-icon" aria-hidden="true" />
      <div className="pc-blocked-songs-notice-copy">
        <p className="pc-blocked-songs-notice-title">{title}</p>
        <p className="pc-blocked-songs-notice-detail">{BLOCKED_DETAIL}</p>
      </div>
      <button
        type="button"
        className="pc-button pc-blocked-songs-notice-action"
        onClick={() => void handleAutoFixBlocked()}
        disabled={isMatching}
        title="Find and replace restricted videos with playable versions"
      >
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{isMatching ? "Auto-fixing..." : "Auto-Fix"}</span>
      </button>
    </div>
  );
};
