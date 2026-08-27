import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Desktop, Taskbar, Window, Workspace } from "@miquelt9/pc-ui";
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
import { useTheme } from "../../state/ThemeContext";
import { useAutoDeleteEmptyDeckOnLeave } from "../../hooks/useAutoDeleteEmptyDeckOnLeave";
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

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  const { decks, activeDeck, loadDeck } = useDeck();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  useAutoDeleteEmptyDeckOnLeave();

  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [showVideoWindow, setShowVideoWindow] = useState(false);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));

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

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isPlaying = playerState?.state === "playing";
  const hasActiveClip = Boolean(playerState?.currentClip);
  const currentDeckId = activeDeck?.id || decks[0]?.id;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const activeTab =
    path === "/settings"
      ? "settings"
      : /\/cards$/.test(path)
        ? "cards"
        : /\/play$/.test(path)
          ? "host"
          : /^\/deck\/[^/]+$/.test(path)
            ? "editor"
            : path === "/"
              ? "decks"
              : null;

  const taskbarItemClass = (tab: string) =>
    `pc-button pc-taskbar-item ${activeTab === tab ? "active" : ""}`;

  const scrollPaddingClass = hasActiveClip
    ? isPlayerMinimized
      ? "pc-workspace-scroll--player-minimized"
      : "pc-workspace-scroll--has-player"
    : "";

  return (
    <Desktop tiled theme={theme}>
      <Workspace>
        <div className={`pc-workspace-scroll print:p-0 ${scrollPaddingClass}`}>{children}</div>
      </Workspace>

      {hasActiveClip && (
        <div className="fixed bottom-12 left-3 right-3 z-40 max-w-3xl mx-auto print:hidden shadow-lg">
          <Window
            title={
              isPlayerMinimized ? (
                <span className="inline-flex items-center gap-2 truncate text-xs font-normal">
                  <Music className={`w-3.5 h-3.5 shrink-0 ${isPlaying ? "animate-bounce" : ""}`} />
                  <strong className="font-bold">Now Playing:</strong>
                  <span className="truncate">
                    {playerState?.currentClip?.artist ? `${playerState.currentClip.artist} — ` : ""}
                    {playerState?.currentClip?.title || "Audio clip"}
                  </span>
                  {playerState && playerState.remainingTime > 0 && (
                    <span className="font-mono text-[11px] opacity-80 shrink-0">
                      ({playerState.remainingTime.toFixed(1)}s)
                    </span>
                  )}
                </span>
              ) : (
                "Now Playing"
              )
            }
            className="w-full"
            onClose={stopPlayback}
            onMinimize={() => setIsPlayerMinimized(!isPlayerMinimized)}
            onMaximize={isPlayerMinimized ? () => setIsPlayerMinimized(false) : undefined}
          >
            {!isPlayerMinimized && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                  <Music className={`w-5 h-5 shrink-0 ${isPlaying ? "animate-bounce" : ""}`} />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate max-w-xs sm:max-w-md">
                      {playerState?.currentClip?.title || "Playing YouTube Snippet"}
                    </p>
                    <p className="text-xs truncate max-w-xs sm:max-w-md">
                      {playerState?.errorMessage ? (
                        <span className="text-red-500 font-semibold">{playerState.errorMessage}</span>
                      ) : (
                        <>
                          {playerState?.currentClip?.artist || "Audio snippet"} •{" "}
                          {playerState?.remainingTime.toFixed(1)}s remaining
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    className="pc-button"
                    onClick={isPlaying ? pausePlayback : resumePlayback}
                    title={isPlaying ? "Pause" : "Play / Replay"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <button type="button" className="pc-button" onClick={stopPlayback} title="Stop playback">
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    className="pc-button"
                    onClick={toggleMute}
                    title={playerState?.isMuted ? "Unmute" : "Mute"}
                  >
                    {playerState?.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={playerState?.isMuted ? 0 : playerState?.volume ?? 100}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-20 cursor-pointer hidden sm:block"
                    aria-label="Volume"
                  />
                  <button
                    type="button"
                    className="pc-button"
                    onClick={() => setShowVideoWindow(!showVideoWindow)}
                    title="Toggle visual video preview"
                  >
                    <span>Video</span>
                    {showVideoWindow ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </Window>
        </div>
      )}

      <div
        className={`fixed print:hidden ${
          showVideoWindow
            ? "z-50 pc-window bottom-32 right-4 sm:right-8 w-72 sm:w-80"
            : "-left-[9999px] top-0 w-80 h-52 opacity-0 pointer-events-none -z-50"
        }`}
      >
        {showVideoWindow && (
          <div className="pc-titlebar">
            <div className="pc-titlebar-title">YouTube</div>
            <div className="pc-titlebar-controls">
              <button
                type="button"
                className="pc-titlebar-btn"
                onClick={() => setShowVideoWindow(false)}
                aria-label="Close"
              >
                X
              </button>
            </div>
          </div>
        )}
        <div className={showVideoWindow ? "aspect-video bg-black" : "w-80 h-52 bg-black"}>
          <div id="youtube-player-singleton" className="w-full h-full" />
        </div>
      </div>

      <Taskbar className="print:hidden">
        <Link to="/" className="pc-button pc-start-btn">
          Start
        </Link>
        <NavLink to="/" end className={() => taskbarItemClass("decks")}>
          <FolderOpen className="w-3.5 h-3.5" />
          Decks
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}` : "/"}
          end
          className={() => taskbarItemClass("editor")}
        >
          <Edit3 className="w-3.5 h-3.5" />
          Editor
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}/cards` : "/"}
          className={() => taskbarItemClass("cards")}
        >
          <Printer className="w-3.5 h-3.5" />
          Cards
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}/play` : "/"}
          className={() => taskbarItemClass("host")}
        >
          <Radio className="w-3.5 h-3.5" />
          Host
        </NavLink>
        <NavLink to="/settings" className={() => taskbarItemClass("settings")}>
          <Settings className="w-3.5 h-3.5" />
          Settings
        </NavLink>

        {decks.length > 0 && (
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
            className="pc-select max-w-[160px] hidden lg:inline"
            title="Active deck"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.tracks.length})
              </option>
            ))}
          </select>
        )}

        {isAuthenticated && (
          <button
            type="button"
            onClick={logout}
            title="Disconnect Spotify account"
            className="pc-button hidden sm:inline-flex"
          >
            <LogOut className="w-3.5 h-3.5" />
            Spotify
          </button>
        )}

        <div className="pc-taskbar-clock">{clock}</div>
      </Taskbar>
    </Desktop>
  );
};
