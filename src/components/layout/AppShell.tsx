import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Desktop, Taskbar, Window, Workspace } from "@miquelt9/pc-ui";
import {
  FolderOpen,
  Edit3,
  Printer,
  Radio,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../state/AuthContext";
import { useDeck } from "../../state/DeckContext";
import { useTheme } from "../../state/ThemeContext";
import { useAutoDeleteEmptyDeckOnLeave } from "../../hooks/useAutoDeleteEmptyDeckOnLeave";
import { PlayerUIProvider, usePlayerUI } from "../../state/PlayerUIContext";
import { DraggableVideoWindow } from "../player/DraggableVideoWindow";
import { YoutubeVideoSlots } from "../player/YoutubeVideoSlots";
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
import { BlockedSongsTaskbarNotice } from "./BlockedSongsTaskbarNotice";

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    videoWindowBounds,
    setVideoWindowBounds,
  } = usePlayerUI();

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
    if (isHostRoute) {
      setShowVideo(true);
    }
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

  return (
    <Desktop tiled theme={theme}>
      <Workspace>
        <div className={`pc-workspace-scroll print:p-0 ${scrollPaddingClass}`}>{children}</div>
      </Workspace>

      {hasActiveClip && !isHostRoute && (
        <div className="fixed bottom-12 left-3 right-3 z-40 max-w-3xl mx-auto print:hidden shadow-lg">
          <Window title="Now Playing" className="w-full" onClose={stopPlayback}>
            <NowPlayingControls
              playerState={playerState}
              onPlayPause={handlePlayPause}
              onStop={stopPlayback}
              onToggleMute={toggleMute}
              onVolumeChange={setVolume}
              onToggleVideo={toggleVideo}
              showVideo={showVideo}
            />
          </Window>
        </div>
      )}

      <DraggableVideoWindow
        visible={showVideo}
        bounds={videoWindowBounds}
        onBoundsChange={setVideoWindowBounds}
        onClose={() => setShowVideo(false)}
      >
        <YoutubeVideoSlots />
      </DraggableVideoWindow>

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
