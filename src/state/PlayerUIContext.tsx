import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type VideoSize = "normal" | "large" | "fullscreen";

interface PlayerUIContextValue {
  showVideo: boolean;
  setShowVideo: (show: boolean) => void;
  toggleVideo: () => void;
  videoSize: VideoSize;
  setVideoSize: (size: VideoSize) => void;
  cycleVideoSizeUp: () => void;
  cycleVideoSizeDown: () => void;
}

const PlayerUIContext = createContext<PlayerUIContextValue | null>(null);

export const PlayerUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoSize, setVideoSize] = useState<VideoSize>("normal");

  const toggleVideo = useCallback(() => setShowVideo((v) => !v), []);

  const cycleVideoSizeUp = useCallback(() => {
    setVideoSize((s) => (s === "normal" ? "large" : s === "large" ? "fullscreen" : "fullscreen"));
  }, []);

  const cycleVideoSizeDown = useCallback(() => {
    setVideoSize((s) => (s === "fullscreen" ? "large" : s === "large" ? "normal" : "normal"));
  }, []);

  const value = useMemo(
    () => ({
      showVideo,
      setShowVideo,
      toggleVideo,
      videoSize,
      setVideoSize,
      cycleVideoSizeUp,
      cycleVideoSizeDown,
    }),
    [showVideo, toggleVideo, videoSize, cycleVideoSizeUp, cycleVideoSizeDown]
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
