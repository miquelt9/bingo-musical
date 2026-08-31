import React, { useEffect, useRef } from "react";
import { setPlayerFallbackContainer } from "../../lib/youtube/player";
import { YoutubeVideoSlots } from "./YoutubeVideoSlots";

/**
 * Always-mounted YouTube player engine. Stays in a hidden off-screen fallback
 * until a host viewport claims it via attachPlayersToViewport().
 */
export const YoutubePlayerEngine: React.FC = React.memo(function YoutubePlayerEngine() {
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPlayerFallbackContainer(fallbackRef.current);
    return () => setPlayerFallbackContainer(null);
  }, []);

  return (
    <div
      ref={fallbackRef}
      className="youtube-player-engine-fallback print:hidden"
      aria-hidden="true"
    >
      <YoutubeVideoSlots />
    </div>
  );
});
