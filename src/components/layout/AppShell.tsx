import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Music,
  FolderOpen,
  Edit3,
  Printer,
  Radio,
  Settings,
  Volume2,
  VolumeX,
  Square,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import { useDeck } from "../../state/DeckContext";
import {
  mountPlayer,
  subscribeToPlayerState,
  PlayerPlaybackState,
  stopPlayback,
  pausePlayback,
  resumePlayback,
  setVolume,
  toggleMute,
} from "../../lib/youtube/player";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  const { decks, activeDeck, loadDeck } = useDeck();
  const location = useLocation();
  const navigate = useNavigate();

  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [showVideoWindow, setShowVideoWindow] = useState<boolean>(false);

  // Mount singleton player once
  useEffect(() => {
    mountPlayer("youtube-player-singleton").catch((err) => {
      console.warn("YouTube player init:", err);
    });

    const unsubscribe = subscribeToPlayerState((state) => {
      setPlayerState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isPlaying = playerState?.state === "playing";
  const hasActiveClip = Boolean(playerState?.currentClip);

  // Determine active deck ID from route or context
  const currentDeckId = activeDeck?.id || decks[0]?.id;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Music className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white block leading-tight">
                Musical Bingo
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                Creator & Host
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`
              }
            >
              <FolderOpen className="w-4 h-4" />
              <span>Decks</span>
            </NavLink>

            <NavLink
              to={currentDeckId ? `/deck/${currentDeckId}` : "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`
              }
            >
              <Edit3 className="w-4 h-4" />
              <span>Editor</span>
            </NavLink>

            <NavLink
              to={currentDeckId ? `/deck/${currentDeckId}/cards` : "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`
              }
            >
              <Printer className="w-4 h-4" />
              <span>Bingo Cards</span>
            </NavLink>

            <NavLink
              to={currentDeckId ? `/deck/${currentDeckId}/play` : "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  isActive
                    ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                }`
              }
            >
              <Radio className="w-4 h-4" />
              <span>Host Game</span>
            </NavLink>
          </nav>

          {/* Right Actions: Deck Selector + Spotify + Settings */}
          <div className="flex items-center gap-3">
            {/* Active Deck Selector */}
            {decks.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-zinc-800">
                <span className="text-xs text-zinc-400 font-medium">Deck:</span>
                <select
                  value={activeDeck?.id || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    loadDeck(id);
                    if (location.pathname.startsWith("/deck/")) {
                      const suffix = location.pathname.includes("/cards")
                        ? "/cards"
                        : location.pathname.includes("/play")
                        ? "/play"
                        : "";
                      navigate(`/deck/${id}${suffix}`);
                    }
                  }}
                  className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-200 outline-none focus:border-emerald-500 max-w-[180px] truncate cursor-pointer"
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.tracks.length})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isAuthenticated && (
              <button
                type="button"
                onClick={logout}
                title="Disconnect Spotify account"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline">Spotify Connected</span>
                <LogOut className="w-3.5 h-3.5 text-zinc-400 ml-0.5" />
              </button>
            )}

            {/* Settings Link */}
            <NavLink
              to="/settings"
              title="Settings & Spotify Client ID"
              className={({ isActive }) =>
                `p-2 rounded-xl transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`
              }
            >
              <Settings className="w-5 h-5" />
            </NavLink>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 pb-32 print:p-0 print:m-0 print:max-w-none">
        {children}
      </main>

      {/* Persistent Floating Mini-Player / Status Bar */}
      {hasActiveClip && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-8 sm:right-8 z-40 max-w-4xl mx-auto print:hidden animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-zinc-900/95 border border-zinc-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Track Info */}
            <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Music className={`w-5 h-5 ${isPlaying ? "animate-bounce" : ""}`} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-white truncate max-w-xs sm:max-w-md">
                  {playerState?.currentClip?.title || "Playing YouTube Snippet"}
                </p>
                <p className="text-xs text-zinc-400 truncate max-w-xs sm:max-w-md">
                  {playerState?.currentClip?.artist || "Audio snippet"} •{" "}
                  <span className="text-emerald-400 font-mono font-medium">
                    {playerState?.remainingTime.toFixed(1)}s remaining
                  </span>
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Play / Pause */}
              <button
                type="button"
                onClick={isPlaying ? pausePlayback : resumePlayback}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              {/* Stop */}
              <button
                type="button"
                onClick={stopPlayback}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                title="Stop playback"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>

              {/* Volume & Mute */}
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              >
                {playerState?.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min="0"
                max="100"
                value={playerState?.isMuted ? 0 : playerState?.volume ?? 100}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 accent-emerald-500 cursor-pointer hidden sm:block"
              />

              {/* Toggle Video Preview Window */}
              <button
                type="button"
                onClick={() => setShowVideoWindow(!showVideoWindow)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors border border-zinc-700"
                title="Toggle visual video preview"
              >
                <span>Video</span>
                {showVideoWindow ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Singleton YouTube IFrame Container (Strictly complies with YouTube ToS) */}
      <div
        className={`fixed z-50 transition-all duration-300 print:hidden ${
          showVideoWindow
            ? "bottom-24 right-4 sm:right-8 w-72 sm:w-80 aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/50 bg-black"
            : "bottom-0 right-0 w-1 h-1 opacity-0 pointer-events-none"
        }`}
      >
        <div id="youtube-player-singleton" className="w-full h-full" />
      </div>
    </div>
  );
};
