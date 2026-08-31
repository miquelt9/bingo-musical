import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Input, Window, Split } from "@miquelt9/pc-ui";
import { useDeck } from "../state/DeckContext";
import { usePlayerUI } from "../state/PlayerUIContext";
import { Track } from "../types/deck";
import { shuffleArray } from "../lib/bingo/generateCards";
import { AnswerCard } from "../components/host/AnswerCard";
import { CallNextControls } from "../components/host/CallNextControls";
import { ClipPreviewButton } from "../components/tracks/ClipPreviewButton";
import { PlayabilityGateOverlay } from "../components/ui/PlayabilityGateOverlay";
import { PcModal } from "../components/ui/PcModal";
import { PageHeader } from "../components/layout/PageHeader";
import { HostInlineVideoPanel } from "../components/player/DraggableVideoWindow";
import { attachPlayersToViewport } from "../lib/youtube/player";
import { usePlayabilityGate } from "../hooks/usePlayabilityGate";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  playClip,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  subscribeToPlayerState,
  setVolume,
  toggleMute,
  preloadClip,
  setCrossfadeConfig,
  setPlaybackFadeConfig,
  setPlayerPrivacyMode,
  continueClipPlayback,
  activatePreloadedClip,
  PlayerPlaybackState,
  Clip,
} from "../lib/youtube/player";
import { getYoutubeThumbnailUrl } from "../lib/youtube/parseUrl";
import { getDeckReadiness } from "../lib/decks/readiness";
import {
  HOST_SESSION_KEY,
  getDisplayChannelName,
  HostDisplayState,
  HostSessionData,
  SerializedCalledEntry,
} from "../lib/host/session";
import { trackEvent } from "../lib/analytics/trackEvent";
import { History, Search, Sparkles, Music2, RotateCcw, ChevronDown } from "lucide-react";
import confetti from "canvas-confetti";

export interface CalledEntry {
  callNumber: number;
  track: Track;
  calledAt: string;
}

const REVEAL_BEFORE_CHAIN_MS = 3000;
const DEFAULT_CROSSFADE_MS = 1500;
const CROSSFADE_SESSION_KEY = "bingo.host.crossfadeOverlapMs";

function trackToClip(track: Track): Clip | null {
  if (!track.youtubeVideoId) return null;
  return {
    videoId: track.youtubeVideoId,
    startTime: track.startTime,
    endTime: track.endTime,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
  };
}

function readStoredCrossfadeMs(deckId: string): number {
  try {
    const raw = sessionStorage.getItem(`${CROSSFADE_SESSION_KEY}.${deckId}`);
    if (raw == null) return DEFAULT_CROSSFADE_MS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_CROSSFADE_MS;
    return Math.max(0, Math.min(3000, parsed));
  } catch {
    return DEFAULT_CROSSFADE_MS;
  }
}

function serializeCalledEntry(entry: CalledEntry): SerializedCalledEntry {
  return { callNumber: entry.callNumber, trackId: entry.track.id, calledAt: entry.calledAt };
}

function deserializeCalledEntry(
  entry: SerializedCalledEntry,
  tracks: Track[]
): CalledEntry | null {
  const track = tracks.find((t) => t.id === entry.trackId);
  if (!track) return null;
  return { callNumber: entry.callNumber, track, calledAt: entry.calledAt };
}

function readHostSession(
  deckId: string,
  tracks: Track[]
): {
  uncalledIds: string[];
  calledHistory: CalledEntry[];
  currentCall: CalledEntry | null;
  isRevealed: boolean;
  autoRevealOnEnd: boolean;
  autoCallNextOnEnd: boolean;
} | null {
  try {
    const raw = sessionStorage.getItem(`${HOST_SESSION_KEY}.${deckId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as HostSessionData;
    const trackIds = new Set(tracks.map((t) => t.id));
    const uncalledIds = data.uncalledIds?.filter((id) => trackIds.has(id)) ?? [];
    const calledHistory =
      data.calledHistory
        ?.map((e) => deserializeCalledEntry(e, tracks))
        .filter((e): e is CalledEntry => e !== null) ?? [];
    const currentCall = data.currentCall
      ? deserializeCalledEntry(data.currentCall, tracks)
      : null;
    return {
      uncalledIds,
      calledHistory,
      currentCall,
      isRevealed: data.isRevealed ?? false,
      autoRevealOnEnd: data.autoRevealOnEnd ?? false,
      autoCallNextOnEnd: data.autoCallNextOnEnd ?? true,
    };
  } catch {
    return null;
  }
}

function writeHostSession(
  deckId: string,
  data: {
    uncalledIds: string[];
    calledHistory: CalledEntry[];
    currentCall: CalledEntry | null;
    isRevealed: boolean;
    autoRevealOnEnd: boolean;
    autoCallNextOnEnd: boolean;
  }
): void {
  try {
    const payload: HostSessionData = {
      uncalledIds: data.uncalledIds,
      calledHistory: data.calledHistory.map(serializeCalledEntry),
      currentCall: data.currentCall ? serializeCalledEntry(data.currentCall) : null,
      isRevealed: data.isRevealed,
      autoRevealOnEnd: data.autoRevealOnEnd,
      autoCallNextOnEnd: data.autoCallNextOnEnd,
    };
    sessionStorage.setItem(`${HOST_SESSION_KEY}.${deckId}`, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearHostSession(deckId: string): void {
  try {
    sessionStorage.removeItem(`${HOST_SESSION_KEY}.${deckId}`);
  } catch {
    // ignore
  }
}

export const HostPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { decks, loadDeck, updateDeck, isLoading } = useDeck();
  const { showVideo, toggleVideo } = usePlayerUI();

  const deck = useMemo(
    () => (id ? decks.find((d) => d.id === id) ?? null : null),
    [id, decks]
  );

  useEffect(() => {
    if (id) loadDeck(id);
  }, [id, loadDeck]);

  const [uncalledIds, setUncalledIds] = useState<string[]>([]);
  const [calledHistory, setCalledHistory] = useState<CalledEntry[]>([]);
  const [currentCall, setCurrentCall] = useState<CalledEntry | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [autoRevealOnEnd, setAutoRevealOnEnd] = useState<boolean>(false);
  const [autoCallNextOnEnd, setAutoCallNextOnEnd] = useState<boolean>(true);
  const [crossfadeOverlapMs, setCrossfadeOverlapMs] = useState<number>(DEFAULT_CROSSFADE_MS);
  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [historySearch, setHistorySearch] = useState<string>("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [showContinueModal, setShowContinueModal] = useState(false);
  const [showBingoModal, setShowBingoModal] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const chainTimeoutRef = useRef<number | null>(null);
  const videoViewportRef = useRef<HTMLDivElement>(null);
  const uncalledIdsRef = useRef(uncalledIds);
  const autoCallNextOnEndRef = useRef(autoCallNextOnEnd);
  const autoRevealOnEndRef = useRef(autoRevealOnEnd);
  const crossfadeOverlapMsRef = useRef(crossfadeOverlapMs);
  const handleCallNextRef = useRef<() => void>(() => {});
  const pendingRestoreRef = useRef<ReturnType<typeof readHostSession> | null>(null);
  const displayChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    uncalledIdsRef.current = uncalledIds;
  }, [uncalledIds]);

  useEffect(() => {
    autoCallNextOnEndRef.current = autoCallNextOnEnd;
  }, [autoCallNextOnEnd]);

  useEffect(() => {
    autoRevealOnEndRef.current = autoRevealOnEnd;
  }, [autoRevealOnEnd]);

  useEffect(() => {
    crossfadeOverlapMsRef.current = crossfadeOverlapMs;
    setCrossfadeConfig(crossfadeOverlapMs, autoCallNextOnEnd);
    setPlaybackFadeConfig(crossfadeOverlapMs, crossfadeOverlapMs);
  }, [crossfadeOverlapMs, autoCallNextOnEnd]);

  useEffect(() => {
    if (!deck) return;
    setCrossfadeOverlapMs(readStoredCrossfadeMs(deck.id));
  }, [deck?.id]);

  const persistCrossfadeMs = useCallback(
    (ms: number) => {
      setCrossfadeOverlapMs(ms);
      if (deck) {
        try {
          sessionStorage.setItem(`${CROSSFADE_SESSION_KEY}.${deck.id}`, String(ms));
        } catch {
          // ignore
        }
      }
    },
    [deck]
  );

  const preloadNextTrack = useCallback(
    (remainingIds: string[]) => {
      if (!deck || !autoCallNextOnEndRef.current || remainingIds.length === 0) return;
      const nextTrack = deck.tracks.find((t) => t.id === remainingIds[0]);
      if (!nextTrack) return;
      const clip = trackToClip(nextTrack);
      if (clip) preloadClip(clip);
    },
    [deck]
  );

  const handleTracksUpdated = useCallback(
    (updatedTracks: Track[]) => {
      if (!deck) return;
      updateDeck({ ...deck, tracks: updatedTracks });
    },
    [deck, updateDeck]
  );

  const {
    isPlayable,
    isChecking,
    invalidTracks,
    progress: gateProgress,
    runCheck,
  } = usePlayabilityGate(deck?.tracks ?? [], {
    autoRun: Boolean(deck),
    onTracksUpdated: handleTracksUpdated,
  });

  const readiness = useMemo(
    () => getDeckReadiness(deck?.tracks ?? []),
    [deck?.tracks]
  );
  const canHost = isPlayable && readiness.canHost;

  const clearChainTimeout = useCallback(() => {
    if (chainTimeoutRef.current !== null) {
      window.clearTimeout(chainTimeoutRef.current);
      chainTimeoutRef.current = null;
    }
  }, []);

  const initGame = useCallback(() => {
    if (!deck) return;
    clearChainTimeout();
    const shuffled = shuffleArray(deck.tracks.map((t) => t.id));
    setUncalledIds(shuffled);
    setCalledHistory([]);
    setCurrentCall(null);
    setIsRevealed(false);
    stopPlayback();
    clearHostSession(deck.id);
  }, [deck, clearChainTimeout]);

  const onClipEnd = useCallback(() => {
    if (autoCallNextOnEndRef.current && uncalledIdsRef.current.length > 0) {
      setIsRevealed(true);
      chainTimeoutRef.current = window.setTimeout(() => {
        chainTimeoutRef.current = null;
        if (uncalledIdsRef.current.length > 0) {
          handleCallNextRef.current();
        }
      }, REVEAL_BEFORE_CHAIN_MS);
    } else if (autoRevealOnEndRef.current) {
      setIsRevealed(true);
    }
  }, []);

  const handleCallNext = useCallback(() => {
    if (!deck || !canHost || uncalledIds.length === 0) return;

    clearChainTimeout();

    const nextId = uncalledIds[0];
    const remaining = uncalledIds.slice(1);
    const track = deck.tracks.find((t) => t.id === nextId);

    if (!track) return;

    const callNumber = calledHistory.length + 1;
    const newEntry: CalledEntry = {
      callNumber,
      track,
      calledAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };

    const clip = trackToClip(track);
    const isFirstCall = calledHistory.length === 0;
    const isLastCall = remaining.length === 0;
    const playbackOpts = { fadeIn: isFirstCall, fadeOut: isLastCall };

    setUncalledIds(remaining);
    setCurrentCall(newEntry);
    setCalledHistory((prev) => [newEntry, ...prev]);
    setIsRevealed(false);

    if (clip) {
      if (
        !continueClipPlayback(clip, onClipEnd, playbackOpts) &&
        !activatePreloadedClip(clip, onClipEnd, playbackOpts)
      ) {
        playClip(clip, onClipEnd, playbackOpts);
      }
      preloadNextTrack(remaining);
    } else if (autoCallNextOnEnd && remaining.length > 0) {
      chainTimeoutRef.current = window.setTimeout(() => {
        chainTimeoutRef.current = null;
        if (uncalledIdsRef.current.length > 0) {
          handleCallNextRef.current();
        }
      }, REVEAL_BEFORE_CHAIN_MS);
    }
  }, [deck, canHost, uncalledIds, calledHistory.length, onClipEnd, clearChainTimeout, autoCallNextOnEnd, preloadNextTrack]);

  useEffect(() => {
    handleCallNextRef.current = handleCallNext;
  }, [handleCallNext]);

  const initializedDeckIdRef = useRef<string | null>(null);
  const hostTrackedRef = useRef(false);

  useEffect(() => {
    if (!sessionReady || hostTrackedRef.current) return;
    hostTrackedRef.current = true;
    trackEvent("host_started");
  }, [sessionReady]);

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
      return;
    }

    if (isLoading) return;

    if (!deck) {
      navigate("/", { replace: true });
      return;
    }

    if (initializedDeckIdRef.current === deck.id) return;

    initializedDeckIdRef.current = deck.id;
    setSessionReady(false);

    const restored = readHostSession(deck.id, deck.tracks);
    const hasRestorableSession =
      restored &&
      (restored.calledHistory.length > 0 || restored.uncalledIds.length > 0);

    if (hasRestorableSession) {
      pendingRestoreRef.current = restored;
      setShowContinueModal(true);
    } else {
      clearChainTimeout();
      const shuffled = shuffleArray(deck.tracks.map((t) => t.id));
      setUncalledIds(shuffled);
      setCalledHistory([]);
      setCurrentCall(null);
      setIsRevealed(false);
      stopPlayback();
      writeHostSession(deck.id, {
        uncalledIds: shuffled,
        calledHistory: [],
        currentCall: null,
        isRevealed: false,
        autoRevealOnEnd: false,
        autoCallNextOnEnd: true,
      });
      setSessionReady(true);
    }
  }, [id, deck, isLoading, navigate, clearChainTimeout]);

  useEffect(() => {
    if (!deck || sessionReady || initializedDeckIdRef.current !== deck.id) return;
    if (pendingRestoreRef.current) return;
    setSessionReady(true);
  }, [
    deck,
    sessionReady,
    uncalledIds,
    calledHistory,
    currentCall,
    isRevealed,
    autoRevealOnEnd,
    autoCallNextOnEnd,
  ]);

  useEffect(() => {
    if (!deck || !sessionReady) return;
    writeHostSession(deck.id, {
      uncalledIds,
      calledHistory,
      currentCall,
      isRevealed,
      autoRevealOnEnd,
      autoCallNextOnEnd,
    });
  }, [
    deck,
    uncalledIds,
    calledHistory,
    currentCall,
    isRevealed,
    autoRevealOnEnd,
    autoCallNextOnEnd,
    sessionReady,
  ]);

  useEffect(() => {
    if (!isMobile) return;
    if (!showVideo) {
      attachPlayersToViewport(null);
      return;
    }
    attachPlayersToViewport(videoViewportRef.current);
    return () => attachPlayersToViewport(null);
  }, [isMobile, showVideo, playerState?.isReady]);

  useEffect(() => {
    return subscribeToPlayerState((state) => {
      setPlayerState(state);
    });
  }, []);

  useEffect(() => {
    return () => {
      clearChainTimeout();
      stopPlayback();
    };
  }, [clearChainTimeout]);

  const handleReplayCurrent = () => {
    if (!currentCall?.track) return;
    const clip = trackToClip(currentCall.track);
    if (!clip) return;
    playClip(clip, onClipEnd);
    if (uncalledIds.length > 0) {
      preloadNextTrack(uncalledIds);
    }
  };

  const handleTogglePlayPause = () => {
    if (playerState?.state === "playing") {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  const handleResetGame = () => {
    setShowResetModal(false);
    initGame();
  };

  const applyRestoredSession = useCallback(() => {
    const restored = pendingRestoreRef.current;
    if (!restored) return;
    setUncalledIds(restored.uncalledIds);
    setCalledHistory(restored.calledHistory);
    setCurrentCall(restored.currentCall);
    setIsRevealed(restored.isRevealed);
    setAutoRevealOnEnd(restored.autoRevealOnEnd);
    setAutoCallNextOnEnd(restored.autoCallNextOnEnd);
    pendingRestoreRef.current = null;
    setSessionReady(true);
  }, []);

  const handleContinueGame = () => {
    setShowContinueModal(false);
    applyRestoredSession();
  };

  const handleStartNewGame = () => {
    setShowContinueModal(false);
    pendingRestoreRef.current = null;
    if (!deck) return;
    clearChainTimeout();
    const shuffled = shuffleArray(deck.tracks.map((t) => t.id));
    setUncalledIds(shuffled);
    setCalledHistory([]);
    setCurrentCall(null);
    setIsRevealed(false);
    stopPlayback();
    writeHostSession(deck.id, {
      uncalledIds: shuffled,
      calledHistory: [],
      currentCall: null,
      isRevealed: false,
      autoRevealOnEnd: false,
      autoCallNextOnEnd: true,
    });
    setSessionReady(true);
  };

  const openDisplayWindow = useCallback(() => {
    if (!deck) return;
    const url = `${window.location.origin}${window.location.pathname}#/deck/${deck.id}/display`;
    window.open(url, `bingo-display-${deck.id}`, "noopener,noreferrer,width=1024,height=768");
  }, [deck]);

  const buildDisplayState = useCallback((): HostDisplayState | null => {
    if (!deck) return null;
    const isPlayingNow =
      playerState?.state === "playing" &&
      playerState?.currentClip?.trackId === currentCall?.track.id;
    return {
      callNumber: currentCall?.callNumber ?? 0,
      totalCount: deck.tracks.length,
      calledCount: calledHistory.length,
      isRevealed,
      isPlaying: Boolean(isPlayingNow),
      progress: isPlayingNow ? playerState?.progress ?? 0 : 0,
      title: isRevealed && currentCall ? currentCall.track.title : null,
      artist: isRevealed && currentCall ? currentCall.track.artist : null,
      albumArtUrl: isRevealed && currentCall ? currentCall.track.albumArtUrl : null,
    };
  }, [deck, playerState, currentCall, calledHistory.length, isRevealed]);

  const broadcastDisplayState = useCallback(() => {
    const payload = buildDisplayState();
    if (!payload || !displayChannelRef.current) return;
    displayChannelRef.current.postMessage({ type: "display-state", payload });
  }, [buildDisplayState]);

  useEffect(() => {
    if (!deck) return;
    try {
      displayChannelRef.current = new BroadcastChannel(getDisplayChannelName(deck.id));
    } catch {
      displayChannelRef.current = null;
    }
    return () => {
      displayChannelRef.current?.close();
      displayChannelRef.current = null;
    };
  }, [deck?.id]);

  useEffect(() => {
    if (!sessionReady) return;
    broadcastDisplayState();
  }, [sessionReady, broadcastDisplayState]);

  useEffect(() => {
    setPlayerPrivacyMode(!isRevealed);
  }, [isRevealed]);

  const triggerConfetti = () => {
    pausePlayback();

    const defaults = {
      particleCount: 80,
      spread: 55,
      startVelocity: 50,
      ticks: 200,
      gravity: 1,
      decay: 0.92,
      origin: { y: 0.55 },
    };

    confetti({ ...defaults, angle: 60, origin: { x: 0, y: 0.55 } });
    confetti({ ...defaults, angle: 120, origin: { x: 1, y: 0.55 } });
    setShowBingoModal(true);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canHost) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();

        const clipActiveForCurrent =
          currentCall &&
          playerState?.currentClip?.trackId === currentCall.track.id &&
          (playerState.state === "playing" ||
            playerState.state === "paused" ||
            playerState.state === "buffering");

        if (clipActiveForCurrent) {
          handleTogglePlayPause();
        } else if (uncalledIds.length > 0) {
          handleCallNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentCall,
    playerState,
    uncalledIds.length,
    handleCallNext,
    handleTogglePlayPause,
    isPlayable,
    canHost,
  ]);

  if (!deck) {
    if (isLoading) return null;
    return null;
  }

  const isPlaying = playerState?.state === "playing" && playerState?.currentClip?.trackId === currentCall?.track.id;
  const playbackProgress = playerState?.progress || 0;
  const remainingTime = playerState?.remainingTime || 0;
  const currentErrorMessage = playerState?.errorMessage && playerState?.currentClip?.trackId === currentCall?.track.id ? playerState.errorMessage : null;

  const filteredHistory = calledHistory.filter(
    (item) =>
      item.track.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.track.artist.toLowerCase().includes(historySearch.toLowerCase())
  );

  const answerCard = (
    <AnswerCard
      fill={!isMobile}
      className="host-answer-card"
      track={currentCall?.track || null}
      isRevealed={isRevealed}
      onReveal={() => setIsRevealed(true)}
      onHide={() => setIsRevealed(false)}
      isPlaying={isPlaying}
      progress={playbackProgress}
      remainingTime={remainingTime}
      callNumber={currentCall?.callNumber || 0}
      errorMessage={currentErrorMessage}
    />
  );

  const hostControls = (
    <CallNextControls
      onCallNext={handleCallNext}
      onReplayCurrent={handleReplayCurrent}
      onTogglePlayPause={handleTogglePlayPause}
      onStop={stopPlayback}
      onToggleMute={toggleMute}
      onVolumeChange={setVolume}
      onToggleVideo={toggleVideo}
      showVideo={showVideo}
      playerState={playerState}
      isPlaying={isPlaying}
      currentTrack={currentCall?.track ?? null}
      remainingCount={uncalledIds.length}
      totalCount={deck.tracks.length}
      autoRevealOnEnd={autoRevealOnEnd}
      onToggleAutoReveal={() => setAutoRevealOnEnd(!autoRevealOnEnd)}
      autoCallNextOnEnd={autoCallNextOnEnd}
      onToggleAutoCallNext={() => setAutoCallNextOnEnd(!autoCallNextOnEnd)}
      crossfadeOverlapMs={crossfadeOverlapMs}
      onCrossfadeOverlapChange={persistCrossfadeMs}
      onOpenDisplay={openDisplayWindow}
      gameStarted={calledHistory.length > 0}
      disabled={!canHost}
    />
  );

  const calledSongsLogList = (
    <div className="host-board-log-list pc-bevel-inset p-2 space-y-1">
      {calledHistory.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs">
          <Music2 className="w-10 h-10 mb-2" />
          <p className="font-semibold">No songs called yet.</p>
          <p className="mt-1">When you call a song, it will appear here with the most recent first.</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="py-12 text-center text-xs">
          <p>No called songs match "{historySearch}".</p>
        </div>
      ) : (
        filteredHistory.map((item) => {
          const isCurrent = item.callNumber === currentCall?.callNumber;
          const thumbUrl =
            item.track.albumArtUrl ||
            (item.track.youtubeVideoId
              ? getYoutubeThumbnailUrl(item.track.youtubeVideoId, "hqdefault")
              : "");
          return (
            <div
              key={item.callNumber}
              className={`flex items-center justify-between gap-3 p-2 ${
                isCurrent ? "pc-bevel-inset" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="pc-bevel-outset w-7 h-7 text-xs font-bold flex items-center justify-center shrink-0">
                  #{item.callNumber}
                </span>
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    className="w-9 h-9 object-cover pc-bevel-inset shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 pc-bevel-inset flex items-center justify-center shrink-0">
                    <Music2 className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-xs truncate">
                    {item.track.title}
                  </p>
                  <p className="text-[11px] truncate">{item.track.artist}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono hidden sm:inline">{item.calledAt}</span>
                <ClipPreviewButton track={item.track} size="sm" />
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const calledSongsLogSearch = (
    <div className="relative mb-3 shrink-0">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
      <Input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className={`w-full pl-8 ${isMobile ? "text-base" : ""}`}
        value={historySearch}
        onChange={(e) => setHistorySearch(e.target.value)}
        placeholder="Search called songs only…"
      />
    </div>
  );

  return (
    <div className={`host-board ${isMobile ? "host-board--mobile" : ""}`}>
      <PlayabilityGateOverlay
        deckId={deck.id}
        context="host"
        isChecking={isChecking}
        progress={gateProgress}
        invalidTracks={invalidTracks}
        readiness={readiness}
        onRetry={() => void runCheck(true)}
      />

      <PageHeader
        back={{ fallbackTo: `/deck/${deck.id}`, fallbackLabel: "Deck editor" }}
        primaryAction={
          currentCall ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={triggerConfetti}>
                <Sparkles className="w-3.5 h-3.5" />
                {isMobile ? "Bingo!" : "Someone Called Bingo!"}
              </Button>
              <Button
                type="button"
                onClick={() => setShowResetModal(true)}
                title="Reset game and shuffle all songs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isMobile ? "Reset" : "Reset Bingo"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {isMobile ? (
        <div className="host-board-mobile-stack">
          {answerCard}

          <HostInlineVideoPanel visible={showVideo} viewportRef={videoViewportRef} />

          <div className="host-controls">{hostControls}</div>

          <details className="host-board-log-details" open>
            <summary className="host-board-log-details__summary">
              <History className="w-4 h-4" aria-hidden="true" />
              Called Songs ({calledHistory.length})
              <ChevronDown className="w-4 h-4 host-board-log-details__chevron" aria-hidden="true" />
            </summary>
            <div className="host-board-log-details__body">
              {calledSongsLogSearch}
              {calledSongsLogList}
            </div>
          </details>
        </div>
      ) : (
        <Split direction="row" className="host-board-main">
          <div className="host-board-left pc-tile" style={{ ["--pc-tile-grow" as string]: "7" }}>
            {answerCard}
            <div className="host-controls">{hostControls}</div>
          </div>

          <Window
            fill
            grow={5}
            className="host-board-log"
            title={
              <span className="inline-flex items-center gap-2">
                <History className="w-4 h-4" />
                Called Songs Log ({calledHistory.length})
              </span>
            }
          >
            <div className="host-board-log-body">
              {calledSongsLogSearch}
              {calledSongsLogList}
            </div>
          </Window>
        </Split>
      )}

      {showContinueModal && (
        <PcModal title="Continue Game?" onClose={handleStartNewGame}>
          <p className="text-sm mb-4">
            A game session for this deck was found. Continue where you left off, or start a fresh shuffle?
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={handleStartNewGame}>
              Start New Game
            </Button>
            <Button type="button" variant="primary" onClick={handleContinueGame}>
              Continue Game
            </Button>
          </div>
        </PcModal>
      )}

      {showBingoModal && (
        <PcModal title="Bingo!" onClose={() => setShowBingoModal(false)}>
          <p className="text-sm mb-3">
            Playback paused. Verify the winning card against these recent calls:
          </p>
          <ul className="space-y-2 mb-4">
            {calledHistory.slice(0, 5).map((item) => (
              <li
                key={item.callNumber}
                className="flex items-center gap-2 p-2 pc-bevel-inset text-xs"
              >
                <span className="font-bold shrink-0">#{item.callNumber}</span>
                <span className="truncate">
                  {item.track.title} — {item.track.artist}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted mb-4">
            Use the called songs log search to confirm the player&apos;s claim.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={() => setShowBingoModal(false)}>
              Resume Host
            </Button>
          </div>
        </PcModal>
      )}

      {showResetModal && (
        <PcModal title="Reset Game?" onClose={() => setShowResetModal(false)}>
          <p className="text-sm mb-4">
            This will reset the current game and reshuffle all songs. Called history will be cleared.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleResetGame}>
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Bingo
            </Button>
          </div>
        </PcModal>
      )}
    </div>
  );
};
