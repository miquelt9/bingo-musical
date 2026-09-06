import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getDefaultVideoWindowBounds, VideoWindowBounds } from "../lib/videoWindow";

export type { VideoWindowBounds };

interface PlayerUIContextValue {
  showVideo: boolean;
  setShowVideo: (show: boolean) => void;
  toggleVideo: () => void;
  videoWindowBounds: VideoWindowBounds;
  setVideoWindowBounds: (bounds: VideoWindowBounds) => void;
  engineRequested: boolean;
  requestPlayerEngine: () => void;
}

const PlayerUIContext = createContext<PlayerUIContextValue | null>(null);

export const PlayerUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoWindowBounds, setVideoWindowBounds] = useState<VideoWindowBounds>(
    getDefaultVideoWindowBounds
  );
  const [engineRequested, setEngineRequested] = useState(false);

  const toggleVideo = useCallback(() => setShowVideo((v) => !v), []);
  const requestPlayerEngine = useCallback(() => setEngineRequested(true), []);

  const value = useMemo(
    () => ({
      showVideo,
      setShowVideo,
      toggleVideo,
      videoWindowBounds,
      setVideoWindowBounds,
      engineRequested,
      requestPlayerEngine,
    }),
    [showVideo, toggleVideo, videoWindowBounds, engineRequested, requestPlayerEngine]
  );

  return <PlayerUIContext.Provider value={value}>{children}</PlayerUIContext.Provider>;
};

export function usePlayerUI(): PlayerUIContextValue {
  const ctx = useContext(PlayerUIContext);
  if (!ctx) {
    throw new Error("usePlayerUI must be used within PlayerUIProvider");
  }
  return ctx;
}
