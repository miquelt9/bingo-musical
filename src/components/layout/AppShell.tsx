import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Desktop, Taskbar, Window, Workspace } from "@miquelt9/pc-ui";
import {
  Music,
  FolderOpen,
  Edit3,
  Printer,
  Radio,
  Settings,
  LogOut,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import { useDeck } from "../../state/DeckContext";
import { useTheme } from "../../state/ThemeContext";
import { useAutoDeleteEmptyDeckOnLeave } from "../../hooks/useAutoDeleteEmptyDeckOnLeave";
import { PlayerUIProvider, usePlayerUI, VideoSize } from "../../state/PlayerUIContext";
import { NowPlayingControls } from "../player/NowPlayingControls";
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
import { BlockedSongsTaskbarNotice } from "./BlockedSongsTaskbarNotice";

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getVideoSizeClass(size: VideoSize, isHostRoute: boolean): string {
  if (isHostRoute) {
    switch (size) {
      case "large":
        return "host-video-panel__window--large";
      case "fullscreen":
        return "host-video-panel__window--fullscreen";
      default:
        return "host-video-panel__window--normal";
    }
  }
  switch (size) {
    case "large":
      return "video-window--large";
    case "fullscreen":
      return "video-window--fullscreen";
    default:
      return "video-window--normal";
  }
}

const AppShellInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  const { decks, activeDeck, loadDeck } = useDeck();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    showVideo,
    setShowVideo,
    toggleVideo,
    videoSize,
    cycleVideoSizeUp,
    cycleVideoSizeDown,
  } = usePlayerUI();

  useAutoDeleteEmptyDeckOnLeave();

  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [hostVideoPanel, setHostVideoPanel] = useState<HTMLElement | null>(null);

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

  const isHostRoute = activeTab === "host";

  useEffect(() => {
    if (isHostRoute) {
      setShowVideo(true);
    }
  }, [isHostRoute, setShowVideo]);

  useEffect(() => {
    if (!isHostRoute) {
      setHostVideoPanel(null);
      return;
    }

    const findPanel = () => document.getElementById("host-video-panel");
    setHostVideoPanel(findPanel());

    const observer = new MutationObserver(() => {
      setHostVideoPanel(findPanel());
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isHostRoute, location.pathname]);

  const taskbarItemClass = (tab: string) =>
    `pc-button pc-taskbar-item ${activeTab === tab ? "active" : ""}`;

  const scrollPaddingClass =
    hasActiveClip && !isHostRoute
      ? isPlayerMinimized
        ? "pc-workspace-scroll--player-minimized"
        : "pc-workspace-scroll--has-player"
      : "";

  const handlePlayPause = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  const videoSizeClass = getVideoSizeClass(videoSize, isHostRoute);

  const videoWindow = (
    <div
      className={`print:hidden ${
        showVideo
          ? isHostRoute
            ? `host-video-panel__window ${videoSizeClass}`
            : `fixed z-50 pc-window bottom-32 right-4 sm:right-8 video-window ${videoSizeClass}`
          : isHostRoute
            ? "hidden"
            : "-left-[9999px] top-0 w-80 h-52 opacity-0 pointer-events-none -z-50 fixed"
      }`}
    >
      {showVideo && (
        <div className="pc-titlebar">
          <div className="pc-titlebar-title">YouTube</div>
          <div className="pc-titlebar-controls">
            <button
              type="button"
              className="pc-titlebar-btn"
              onClick={cycleVideoSizeDown}
              aria-label="Make smaller"
              title="Make smaller"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              className="pc-titlebar-btn"
              onClick={cycleVideoSizeUp}
              aria-label="Make bigger"
              title="Make bigger"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              className="pc-titlebar-btn"
              onClick={() => setShowVideo(false)}
              aria-label="Close"
            >
              X
            </button>
          </div>
        </div>
      )}
      <div className={showVideo ? "aspect-video bg-black" : "w-80 h-52 bg-black"}>
        <div id="youtube-player-singleton" className="w-full h-full" />
      </div>
    </div>
  );

  return (
    <Desktop tiled theme={theme}>
      <Workspace>
        <div className={`pc-workspace-scroll print:p-0 ${scrollPaddingClass}`}>{children}</div>
      </Workspace>

      {hasActiveClip && !isHostRoute && (
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
              <NowPlayingControls
                playerState={playerState}
                onPlayPause={handlePlayPause}
                onStop={stopPlayback}
                onToggleMute={toggleMute}
                onVolumeChange={setVolume}
                onToggleVideo={toggleVideo}
                showVideo={showVideo}
              />
            )}
          </Window>
        </div>
      )}

      {isHostRoute && hostVideoPanel && showVideo
        ? createPortal(videoWindow, hostVideoPanel)
        : !isHostRoute
          ? videoWindow
          : (
            <div className="fixed -left-[9999px] top-0 w-80 h-52 opacity-0 pointer-events-none -z-50 print:hidden">
              <div className="w-80 h-52 bg-black">
                <div id="youtube-player-singleton" className="w-full h-full" />
              </div>
            </div>
          )}

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

        <div className="pc-taskbar-trailing">
          <BlockedSongsTaskbarNotice />
          <div className="pc-taskbar-clock">{clock}</div>
        </div>
      </Taskbar>
    </Desktop>
  );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PlayerUIProvider>
      <AppShellInner>{children}</AppShellInner>
    </PlayerUIProvider>
  );
};
