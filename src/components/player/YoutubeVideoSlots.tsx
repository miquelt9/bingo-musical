import React, { useEffect, useRef } from "react";
import { mountDualPlayers, YOUTUBE_SLOT_WRAP_A, YOUTUBE_SLOT_WRAP_B } from "../../lib/youtube/player";

/**
 * Hosts two YouTube iframe mount points. Wrappers are empty in React's tree so
 * reconciliation never replaces iframes the API injects imperatively.
 */
export const YoutubeVideoSlots = React.memo(function YoutubeVideoSlots() {
  const wrapARef = useRef<HTMLDivElement>(null);
  const wrapBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapA = wrapARef.current;
    const wrapB = wrapBRef.current;
    if (!wrapA || !wrapB) return;

    void mountDualPlayers(wrapA, wrapB).catch((err) => {
      console.warn("YouTube player init:", err);
    });
  }, []);

  return (
    <div className="video-window-players">
      <div
        ref={wrapARef}
        id={YOUTUBE_SLOT_WRAP_A}
        data-youtube-slot="a"
        className="video-window-player-slot video-window-player-slot--active"
      />
      <div
        ref={wrapBRef}
        id={YOUTUBE_SLOT_WRAP_B}
        data-youtube-slot="b"
        className="video-window-player-slot video-window-player-slot--standby"
      />
    </div>
  );
});
