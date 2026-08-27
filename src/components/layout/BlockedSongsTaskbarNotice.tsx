import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Sparkles } from "lucide-react";
import { getUnplayableTracks } from "../../lib/youtube/validator";
import { useDeck } from "../../state/DeckContext";
import { useAutoFixBlocked } from "../../hooks/useAutoFixBlocked";

export const BlockedSongsTaskbarNotice: React.FC = () => {
  const { activeDeck } = useDeck();
  const navigate = useNavigate();

  const blockedCount = activeDeck ? getUnplayableTracks(activeDeck.tracks).length : 0;

  const { handleAutoFixBlocked, isMatching } = useAutoFixBlocked(activeDeck, {
    onViewProblems: activeDeck
      ? () => navigate(`/deck/${activeDeck.id}?filter=blocked`)
      : undefined,
  });

  if (!activeDeck || blockedCount === 0) return null;

  const detail =
    "Some videos have playback restrictions outside YouTube. Use Auto-Fix to automatically find and replace them with working versions.";

  return (
    <div
      className="pc-blocked-songs-notice"
      role="status"
      aria-live="polite"
      title={detail}
    >
      <AlertTriangle className="pc-blocked-songs-notice-icon" aria-hidden="true" />
      <div className="pc-blocked-songs-notice-copy">
        <p className="pc-blocked-songs-notice-title">
          {blockedCount} song{blockedCount > 1 ? "s" : ""} cannot play audio in the game
        </p>
        <p className="pc-blocked-songs-notice-detail">{detail}</p>
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
