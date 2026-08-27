import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "../types/deck";
import {
  canStartGame,
  ensureDeckPlayable,
  InvalidTrackEntry,
  markTracksAsFailed,
  DeckPlayabilityResult,
} from "../lib/youtube/playabilityGate";
import { BatchValidationProgress } from "../lib/youtube/validator";

type GateState = "idle" | "checking" | "blocked" | "ready";

export function usePlayabilityGate(
  tracks: Track[],
  options?: {
    autoRun?: boolean;
    onTracksUpdated?: (tracks: Track[]) => void;
  }
) {
  const [gateState, setGateState] = useState<GateState>("idle");
  const [progress, setProgress] = useState<BatchValidationProgress | null>(null);
  const [invalidTracks, setInvalidTracks] = useState<InvalidTrackEntry[]>([]);
  const runIdRef = useRef(0);

  const runCheck = useCallback(
    async (forceRecheck = false): Promise<DeckPlayabilityResult | null> => {
      const runId = ++runIdRef.current;

      if (tracks.length === 0) {
        setInvalidTracks([]);
        setGateState("blocked");
        return { playable: false, invalidTracks: [], validatedAt: Date.now() };
      }

      if (!forceRecheck && canStartGame(tracks)) {
        setInvalidTracks([]);
        setGateState("ready");
        return { playable: true, invalidTracks: [], validatedAt: Date.now() };
      }

      setGateState("checking");
      setProgress(null);

      const result = await ensureDeckPlayable(tracks, {
        forceRecheck,
        onProgress: setProgress,
      });

      if (runId !== runIdRef.current) return null;

      setInvalidTracks(result.invalidTracks);
      setGateState(result.playable ? "ready" : "blocked");
      setProgress(null);

      if (!result.playable && options?.onTracksUpdated) {
        const failedIds = new Set(result.invalidTracks.map((i) => i.track.id));
        options.onTracksUpdated(markTracksAsFailed(tracks, failedIds));
      }

      return result;
    },
    [tracks, options?.onTracksUpdated]
  );

  useEffect(() => {
    if (!options?.autoRun) return;
    void runCheck();
  }, [options?.autoRun, runCheck]);

  return {
    isPlayable: gateState === "ready",
    isChecking: gateState === "checking",
    isBlocked: gateState === "blocked",
    invalidTracks,
    progress,
    runCheck,
    gateState,
  };
}
