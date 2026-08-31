import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Desktop, Taskbar, Window, Workspace } from "@miquelt9/pc-ui";
import {
  FolderOpen,
  Edit3,
  Printer,
  Radio,
  Settings,
} from "lucide-react";
import { useDeck } from "../../state/DeckContext";
import { useTheme } from "../../state/ThemeContext";
import { useAutoDeleteEmptyDeckOnLeave } from "../../hooks/useAutoDeleteEmptyDeckOnLeave";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { PlayerUIProvider, usePlayerUI } from "../../state/PlayerUIContext";
import { DraggableVideoWindow } from "../player/DraggableVideoWindow";
import { YoutubePlayerEngine } from "../player/YoutubePlayerEngine";
import { NowPlayingControls } from "../player/NowPlayingControls";
import {
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

const AppShellInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { decks, activeDeck, loadDeck } = useDeck();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    showVideo,
    setShowVideo,
    toggleVideo,
    videoWindowBounds,
    setVideoWindowBounds,
  } = usePlayerUI();
  const isMobile = useIsMobile();

  useAutoDeleteEmptyDeckOnLeave();

  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    return subscribeToPlayerState((state) => {
      setPlayerState(state);
    });
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
    setShowVideo(isHostRoute);
  }, [isHostRoute, setShowVideo]);

  const taskbarItemClass = (tab: string) =>
    `pc-button pc-taskbar-item ${activeTab === tab ? "active" : ""}`;

  const scrollPaddingClass =
    hasActiveClip && !isHostRoute ? "pc-workspace-scroll--has-player" : "";

  const handlePlayPause = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  const handleDeckChange = (deckId: string) => {
    loadDeck(deckId);
    if (location.pathname.startsWith("/deck/")) {
      const suffix = location.pathname.includes("/cards")
        ? "/cards"
        : location.pathname.includes("/play")
          ? "/play"
          : "";
      navigate(`/deck/${deckId}${suffix}`);
    }
  };

  return (
    <Desktop tiled theme={theme}>
      <Workspace>
        <div className={`pc-workspace-scroll print:p-0 ${scrollPaddingClass}`}>{children}</div>
      </Workspace>

      {hasActiveClip && !isHostRoute && (
        <div className="pc-now-playing-dock fixed left-3 right-3 z-40 max-w-3xl mx-auto print:hidden shadow-lg">
          <Window title="Now Playing" className="w-full" onClose={stopPlayback}>
            <NowPlayingControls
              playerState={playerState}
              onPlayPause={handlePlayPause}
              onStop={stopPlayback}
              onToggleMute={toggleMute}
              onVolumeChange={setVolume}
              onToggleVideo={toggleVideo}
              showVideo={showVideo}
              showVideoToggle={false}
            />
          </Window>
        </div>
      )}

      {isHostRoute && !isMobile && (
        <DraggableVideoWindow
          visible={showVideo && isHostRoute}
          bounds={videoWindowBounds}
          onBoundsChange={setVideoWindowBounds}
          onClose={() => setShowVideo(false)}
        />
      )}

      <YoutubePlayerEngine />

      <Taskbar className="print:hidden">
        <Link to="/" className="pc-button pc-start-btn hidden sm:inline-flex">
          Start
        </Link>
        <NavLink
          to="/"
          end
          title="Decks"
          aria-label="Decks"
          className={() => taskbarItemClass("decks")}
        >
          <FolderOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden sm:inline">Decks</span>
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}` : "/"}
          end
          title="Editor"
          aria-label="Editor"
          className={() => taskbarItemClass("editor")}
        >
          <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden sm:inline">Editor</span>
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}/cards` : "/"}
          title="Cards"
          aria-label="Cards"
          className={() => taskbarItemClass("cards")}
        >
          <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden sm:inline">Cards</span>
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}/play` : "/"}
          title="Host"
          aria-label="Host"
          className={() => taskbarItemClass("host")}
        >
          <Radio className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden sm:inline">Host</span>
        </NavLink>
        <NavLink
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={() => taskbarItemClass("settings")}
        >
          <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="hidden sm:inline">Settings</span>
        </NavLink>

        {decks.length > 0 && (
          <select
            value={activeDeck?.id || ""}
            onChange={(e) => handleDeckChange(e.target.value)}
            className="pc-select pc-taskbar-deck-select min-w-0 flex-1 sm:max-w-[160px] sm:flex-none"
            title="Active deck"
            aria-label="Active deck"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.tracks.length})
              </option>
            ))}
          </select>
        )}

        <div className="pc-taskbar-trailing">
          <div className="pc-taskbar-clock hidden sm:block">{clock}</div>
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
