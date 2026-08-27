import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
import { usePlayabilityGate } from "../hooks/usePlayabilityGate";
import {
  playClip,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  subscribeToPlayerState,
  setVolume,
  toggleMute,
  PlayerPlaybackState,
} from "../lib/youtube/player";
import { getYoutubeThumbnailUrl } from "../lib/youtube/parseUrl";
import { ArrowLeft, History, Search, Sparkles, Music2, RotateCcw } from "lucide-react";
import confetti from "canvas-confetti";

export interface CalledEntry {
  callNumber: number;
  track: Track;
  calledAt: string;
}

const REVEAL_BEFORE_CHAIN_MS = 3000;

export const HostPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decks, loadDeck, updateDeck } = useDeck();
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
  const [autoRevealOnEnd, setAutoRevealOnEnd] = useState<boolean>(true);
  const [autoCallNextOnEnd, setAutoCallNextOnEnd] = useState<boolean>(false);
  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [historySearch, setHistorySearch] = useState<string>("");
  const [showResetModal, setShowResetModal] = useState(false);

  const chainTimeoutRef = useRef<number | null>(null);
  const uncalledIdsRef = useRef(uncalledIds);
  const autoCallNextOnEndRef = useRef(autoCallNextOnEnd);
  const autoRevealOnEndRef = useRef(autoRevealOnEnd);
  const handleCallNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    uncalledIdsRef.current = uncalledIds;
  }, [uncalledIds]);

  useEffect(() => {
    autoCallNextOnEndRef.current = autoCallNextOnEnd;
  }, [autoCallNextOnEnd]);

  useEffect(() => {
    autoRevealOnEndRef.current = autoRevealOnEnd;
  }, [autoRevealOnEnd]);

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
    if (!deck || !isPlayable || uncalledIds.length === 0) return;

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

    setUncalledIds(remaining);
    setCurrentCall(newEntry);
    setCalledHistory((prev) => [newEntry, ...prev]);
    setIsRevealed(false);

    if (track.youtubeVideoId) {
      playClip(
        {
          videoId: track.youtubeVideoId,
          startTime: track.startTime,
          endTime: track.endTime,
          trackId: track.id,
          title: track.title,
          artist: track.artist,
        },
        onClipEnd
      );
    } else {
      setIsRevealed(true);
    }
  }, [deck, isPlayable, uncalledIds, calledHistory.length, onClipEnd, clearChainTimeout]);

  useEffect(() => {
    handleCallNextRef.current = handleCallNext;
  }, [handleCallNext]);

  useEffect(() => {
    if (!deck) {
      if (decks.length > 0) {
        navigate(`/deck/${decks[0].id}/play`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
      return;
    }

    initGame();
  }, [deck, decks, navigate, initGame]);

  useEffect(() => {
    return subscribeToPlayerState((state) => {
      setPlayerState(state);
    });
  }, []);

  useEffect(() => {
    return () => clearChainTimeout();
  }, [clearChainTimeout]);

  const handleReplayCurrent = () => {
    if (!currentCall?.track?.youtubeVideoId) return;
    playClip(
      {
        videoId: currentCall.track.youtubeVideoId,
        startTime: currentCall.track.startTime,
        endTime: currentCall.track.endTime,
        trackId: currentCall.track.id,
        title: currentCall.track.title,
        artist: currentCall.track.artist,
      },
      onClipEnd
    );
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

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.5 },
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayable) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (!currentCall) {
          handleCallNext();
        } else if (!isRevealed) {
          setIsRevealed(true);
        } else {
          handleCallNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentCall, isRevealed, handleCallNext, isPlayable]);

  if (!deck) return null;

  const isPlaying = playerState?.state === "playing" && playerState?.currentClip?.trackId === currentCall?.track.id;
  const playbackProgress = playerState?.progress || 0;
  const remainingTime = playerState?.remainingTime || 0;
  const currentErrorMessage = playerState?.errorMessage && playerState?.currentClip?.trackId === currentCall?.track.id ? playerState.errorMessage : null;

  const filteredHistory = calledHistory.filter(
    (item) =>
      item.track.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.track.artist.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="host-board">
      <PlayabilityGateOverlay
        deckId={deck.id}
        context="host"
        isChecking={isChecking}
        progress={gateProgress}
        invalidTracks={invalidTracks}
        onRetry={() => void runCheck(true)}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <Link to={`/deck/${deck.id}`} className="pc-button">
          <ArrowLeft className="w-4 h-4" />
          Exit Host Mode (Back to Editor)
        </Link>
        {currentCall && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={triggerConfetti}>
              <Sparkles className="w-3.5 h-3.5" />
              Someone Called Bingo!
            </Button>
            <Button
              type="button"
              onClick={() => setShowResetModal(true)}
              title="Reset game and shuffle all songs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Bingo
            </Button>
          </div>
        )}
      </div>

      <Split direction="row" className="host-board-main">
        <div className="host-board-left pc-tile" style={{ ["--pc-tile-grow" as string]: "7" }}>
          <AnswerCard
            fill
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

          <div id="host-video-panel" className="host-video-panel" />

          <div className="host-controls">
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
              hasCurrentTrack={Boolean(currentCall?.track?.youtubeVideoId)}
              remainingCount={uncalledIds.length}
              totalCount={deck.tracks.length}
              autoRevealOnEnd={autoRevealOnEnd}
              onToggleAutoReveal={() => setAutoRevealOnEnd(!autoRevealOnEnd)}
              autoCallNextOnEnd={autoCallNextOnEnd}
              onToggleAutoCallNext={() => setAutoCallNextOnEnd(!autoCallNextOnEnd)}
              disabled={!isPlayable}
            />
          </div>
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
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" />
              <Input
                type="text"
                className="w-full pl-8"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Verify song: type title or artist..."
              />
            </div>
            <div className="host-board-log-list pc-bevel-inset p-2 space-y-1">
              {calledHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs">
                  <Music2 className="w-10 h-10 mb-2" />
                  <p className="font-semibold">No songs called yet.</p>
                  <p className="mt-1">When you call a song, it will appear here in chronological order.</p>
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
                          <p className="font-bold text-xs truncate max-w-[180px] sm:max-w-xs">
                            {item.track.title}
                          </p>
                          <p className="text-[11px] truncate max-w-[180px] sm:max-w-xs">{item.track.artist}</p>
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
          </div>
        </Window>
      </Split>

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
