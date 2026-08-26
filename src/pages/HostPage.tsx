import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { Track } from "../types/deck";
import { shuffleArray } from "../lib/bingo/generateCards";
import { AnswerCard } from "../components/host/AnswerCard";
import { CallNextControls } from "../components/host/CallNextControls";
import { ClipPreviewButton } from "../components/tracks/ClipPreviewButton";
import {
  playClip,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  subscribeToPlayerState,
  PlayerPlaybackState,
} from "../lib/youtube/player";
import {
  ArrowLeft,
  Radio,
  History,
  Search,
  Sparkles,
  Music2,
} from "lucide-react";
import confetti from "canvas-confetti";

export interface CalledEntry {
  callNumber: number;
  track: Track;
  calledAt: string;
}

export const HostPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { decks, loadDeck } = useDeck();

  const deck = useMemo(() => (id ? loadDeck(id) : null), [id, loadDeck]);

  // Game state
  const [uncalledIds, setUncalledIds] = useState<string[]>([]);
  const [calledHistory, setCalledHistory] = useState<CalledEntry[]>([]);
  const [currentCall, setCurrentCall] = useState<CalledEntry | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [autoRevealOnEnd, setAutoRevealOnEnd] = useState<boolean>(true);

  // Player state subscription
  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);

  // History search filter
  const [historySearch, setHistorySearch] = useState<string>("");

  // Initialize or reset game pool
  const initGame = useCallback(() => {
    if (!deck) return;
    const shuffled = shuffleArray(deck.tracks.map((t) => t.id));
    setUncalledIds(shuffled);
    setCalledHistory([]);
    setCurrentCall(null);
    setIsRevealed(false);
    stopPlayback();
  }, [deck]);

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

  // Call next song handler
  const handleCallNext = useCallback(() => {
    if (!deck || uncalledIds.length === 0) return;

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

    // Play clip if YouTube ID exists
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
        () => {
          // Clip finished callback
          if (autoRevealOnEnd) {
            setIsRevealed(true);
          }
        }
      );
    } else {
      // If no video, reveal immediately
      setIsRevealed(true);
    }
  }, [deck, uncalledIds, calledHistory.length, autoRevealOnEnd]);

  // Replay current snippet
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
      () => {
        if (autoRevealOnEnd) {
          setIsRevealed(true);
        }
      }
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
    if (calledHistory.length > 0) {
      if (!confirm("Are you sure you want to reset the current game and reshuffle all songs?")) {
        return;
      }
    }
    initGame();
  };

  // Keyboard shortcut listener: Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
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
  }, [currentCall, isRevealed, handleCallNext]);

  if (!deck) return null;

  const isPlaying = playerState?.state === "playing" && playerState?.currentClip?.trackId === currentCall?.track.id;
  const progress = playerState?.progress || 0;
  const remainingTime = playerState?.remainingTime || 0;

  // Filter history
  const filteredHistory = calledHistory.filter(
    (item) =>
      item.track.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.track.artist.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Host Top Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Link
          to={`/deck/${deck.id}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit Host Mode (Back to Editor)</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>LIVE HOST BOARD</span>
          </div>

          <button
            type="button"
            onClick={() => {
              confetti({
                particleCount: 150,
                spread: 90,
                origin: { y: 0.5 },
              });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Bingo Confetti!</span>
          </button>
        </div>
      </div>

      {/* Main Host Widescreen Grid (2 Columns: Left Stage + Right Log) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Stage: Answer Card & Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Answer Card */}
          <AnswerCard
            track={currentCall?.track || null}
            isRevealed={isRevealed}
            onReveal={() => setIsRevealed(true)}
            onHide={() => setIsRevealed(false)}
            isPlaying={isPlaying}
            progress={progress}
            remainingTime={remainingTime}
            callNumber={currentCall?.callNumber || 0}
          />

          {/* Call Controls */}
          <CallNextControls
            onCallNext={handleCallNext}
            onReplayCurrent={handleReplayCurrent}
            onTogglePlayPause={handleTogglePlayPause}
            onResetGame={handleResetGame}
            isPlaying={isPlaying}
            hasCurrentTrack={Boolean(currentCall?.track?.youtubeVideoId)}
            remainingCount={uncalledIds.length}
            totalCount={deck.tracks.length}
            autoRevealOnEnd={autoRevealOnEnd}
            onToggleAutoReveal={() => setAutoRevealOnEnd(!autoRevealOnEnd)}
          />
        </div>

        {/* Right Stage: Called Songs History Log & Verifier */}
        <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col h-[680px]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Called Songs Log</h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
              {calledHistory.length} Called
            </span>
          </div>

          {/* Search to verify a player's card */}
          <div className="my-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Verify song: type title or artist..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 text-xs text-white placeholder-zinc-500 outline-none"
              />
            </div>
          </div>

          {/* Scrollable Called History List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-zinc-800/40">
            {calledHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-6">
                <Music2 className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-semibold">No songs called yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  When you call a song, it will appear here in chronological order.
                </p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <p>No called songs match "{historySearch}".</p>
                <p className="text-zinc-600 mt-1">
                  (If the player claims this song was called, it hasn't been drawn yet!)
                </p>
              </div>
            ) : (
              filteredHistory.map((item) => {
                const isCurrent = item.callNumber === currentCall?.callNumber;

                return (
                  <div
                    key={item.callNumber}
                    className={`pt-2 flex items-center justify-between gap-3 p-2.5 rounded-2xl transition-colors ${
                      isCurrent
                        ? "bg-emerald-500/10 border border-emerald-500/30"
                        : "hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Call badge */}
                      <span className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-zinc-700/60">
                        #{item.callNumber}
                      </span>

                      <div className="min-w-0">
                        <p className="font-bold text-xs text-white truncate max-w-[180px] sm:max-w-xs">
                          {item.track.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate max-w-[180px] sm:max-w-xs">
                          {item.track.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                        {item.calledAt}
                      </span>
                      <ClipPreviewButton track={item.track} size="sm" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
