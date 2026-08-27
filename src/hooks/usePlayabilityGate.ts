import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Track } from "../types/deck";
import {
  canStartGame,
  ensureDeckPlayable,
  getKnownPlayabilityIssues,
  getPlayabilityIssues,
  applyFailedTracksIfChanged,
  isTrackNeedsVerification,
  InvalidTrackEntry,
  DeckPlayabilityResult,
} from "../lib/youtube/playabilityGate";
import { BatchValidationProgress } from "../lib/youtube/validator";

type GateState = "idle" | "checking" | "blocked" | "ready";

function mergeInvalidTracks(
  current: InvalidTrackEntry[],
  incoming: InvalidTrackEntry[]
): InvalidTrackEntry[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((entry) => [entry.track.id, entry]));
  for (const entry of incoming) {
    byId.set(entry.track.id, entry);
  }
  return Array.from(byId.values());
}

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
  const onTracksUpdatedRef = useRef(options?.onTracksUpdated);
  onTracksUpdatedRef.current = options?.onTracksUpdated;

  const tracksSignature = useMemo(
    () =>
      tracks
        .map((track) => `${track.id}:${track.youtubeVideoId ?? ""}:${track.matchStatus}`)
        .join("|"),
    [tracks]
  );

  const runCheck = useCallback(
    async (forceRecheck = false): Promise<DeckPlayabilityResult | null> => {
      const runId = ++runIdRef.current;

      if (tracks.length === 0) {
        setInvalidTracks([]);
        setGateState("blocked");
        setProgress(null);
        return { playable: false, invalidTracks: [], validatedAt: Date.now() };
      }

      if (!forceRecheck && canStartGame(tracks)) {
        setInvalidTracks([]);
        setGateState("ready");
        setProgress(null);
        return { playable: true, invalidTracks: [], validatedAt: Date.now() };
      }

      const knownIssues = getKnownPlayabilityIssues(tracks);
      const pendingVerificationCount = tracks.filter(
        (track) =>
          track.youtubeVideoId && (forceRecheck || isTrackNeedsVerification(track))
      ).length;

      if (knownIssues.length > 0) {
        setInvalidTracks(knownIssues);
        setGateState("blocked");
      } else if (pendingVerificationCount > 0 || forceRecheck) {
        setGateState("checking");
        setProgress({
          total: tracks.length,
          completed: tracks.length - pendingVerificationCount,
          valid: 0,
          invalid: 0,
        });
      }

      if (pendingVerificationCount === 0 && !forceRecheck) {
        const syncIssues = getPlayabilityIssues(tracks);
        if (runId !== runIdRef.current) return null;

        setInvalidTracks(syncIssues);
        setGateState(syncIssues.length === 0 ? "ready" : "blocked");
        setProgress(null);
        return {
          playable: syncIssues.length === 0,
          invalidTracks: syncIssues,
          validatedAt: Date.now(),
        };
      }

      const result = await ensureDeckPlayable(tracks, {
        forceRecheck,
        onProgress: (nextProgress) => {
          if (runId !== runIdRef.current) return;
          setProgress(nextProgress);
        },
        onIssueFound: (issue) => {
          if (runId !== runIdRef.current) return;
          setInvalidTracks((current) => mergeInvalidTracks(current, [issue]));
          setGateState("blocked");
        },
      });

      if (runId !== runIdRef.current) return null;

      setInvalidTracks(result.invalidTracks);
      setGateState(result.playable ? "ready" : "blocked");
      setProgress(null);

      if (!result.playable && onTracksUpdatedRef.current) {
        const failedIds = new Set(
          result.invalidTracks
            .filter((entry) => entry.reason !== "Audio compatibility not yet verified")
            .map((entry) => entry.track.id)
        );
        const nextTracks = applyFailedTracksIfChanged(tracks, failedIds);
        if (nextTracks) {
          onTracksUpdatedRef.current(nextTracks);
        }
      }

      return result;
    },
    [tracks]
  );

  useEffect(() => {
    if (!options?.autoRun) return;
    void runCheck();
  }, [options?.autoRun, tracksSignature, runCheck]);

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
