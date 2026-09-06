import React, { useEffect } from "react";
import { ensureDeezerPlayersMounted, teardownDeezerPlayers } from "../../lib/deezer/player";

/** Keeps the shared Deezer audio host alive while AppShell requests the engine. */
export const DeezerAudioEngine: React.FC = React.memo(function DeezerAudioEngine() {
  useEffect(() => {
    ensureDeezerPlayersMounted();
    return () => teardownDeezerPlayers();
  }, []);

  return null;
});
