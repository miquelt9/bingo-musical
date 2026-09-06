import React, { useEffect, useRef } from "react";
import {
  DEEZER_SLOT_WRAP_A,
  DEEZER_SLOT_WRAP_B,
  mountDeezerPlayers,
  teardownDeezerPlayers,
} from "../../lib/deezer/player";

export const DeezerAudioEngine: React.FC = React.memo(function DeezerAudioEngine() {
  const wrapARef = useRef<HTMLDivElement>(null);
  const wrapBRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wrapARef.current || !wrapBRef.current) return;
    mountDeezerPlayers(wrapARef.current, wrapBRef.current);
    return () => teardownDeezerPlayers();
  }, []);

  return (
    <div className="deezer-audio-engine-fallback print:hidden" aria-hidden="true">
      <div ref={wrapARef} id={DEEZER_SLOT_WRAP_A} />
      <div ref={wrapBRef} id={DEEZER_SLOT_WRAP_B} />
    </div>
  );
});
