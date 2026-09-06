import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { getDefaultVideoWindowBounds, VideoWindowBounds } from "../lib/videoWindow";
import { MusicProvider } from "../types/deck";

export type { VideoWindowBounds };

interface PlayerUIContextValue {
  showVideo: boolean;
  setShowVideo: (show: boolean) => void;
  toggleVideo: () => void;
  videoWindowBounds: VideoWindowBounds;
  setVideoWindowBounds: (bounds: VideoWindowBounds) => void;
  engineRequested: boolean;
  requestedProvider: MusicProvider | null;
  requestPlayerEngine: (provider?: MusicProvider) => void;
}

const PlayerUIContext = createContext<PlayerUIContextValue | null>(null);

export const PlayerUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoWindowBounds, setVideoWindowBounds] = useState<VideoWindowBounds>(
    getDefaultVideoWindowBounds
  );
  const [engineRequested, setEngineRequested] = useState(false);
  const [requestedProvider, setRequestedProvider] = useState<MusicProvider | null>(null);

  const toggleVideo = useCallback(() => setShowVideo((v) => !v), []);
  const requestPlayerEngine = useCallback((provider?: MusicProvider) => {
    setEngineRequested(true);
    if (provider) setRequestedProvider(provider);
  }, []);

  const value = useMemo(
    () => ({
      showVideo,
      setShowVideo,
      toggleVideo,
      videoWindowBounds,
      setVideoWindowBounds,
      engineRequested,
      requestedProvider,
      requestPlayerEngine,
    }),
    [showVideo, toggleVideo, videoWindowBounds, engineRequested, requestedProvider, requestPlayerEngine]
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
