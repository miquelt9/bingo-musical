import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button, Desktop, Taskbar, Window, Workspace } from "@miquelt9/pc-ui";
import {
  FolderOpen,
  Edit3,
  Printer,
  Radio,
  Settings,
  Loader2,
} from "lucide-react";
import { useDeck } from "../../state/DeckContext";
import { useTheme } from "../../state/ThemeContext";
import { useDeckNavGuards } from "../../hooks/useDeckNavGuards";
import { useIsMobile } from "../../hooks/useMediaQuery";
import {
  activeTabFromPath,
  deckSwitchConfirmMessage,
  isDesktopTaskbarVisible,
  routeDeckIdFromPath,
} from "../../lib/nav/shellNav";
import { MobileNavProvider, type MobileNavLinkItem } from "./MobileNav";
import { useToast } from "../../state/ToastContext";
import { PlayerUIProvider, usePlayerUI } from "../../state/PlayerUIContext";
import { DraggableVideoWindow } from "../player/DraggableVideoWindow";
import { PcModal } from "../ui/PcModal";
import { YoutubePlayerEngine } from "../player/YoutubePlayerEngine";
import { DeezerAudioEngine } from "../player/DeezerAudioEngine";
import { NowPlayingControls } from "../player/NowPlayingControls";
import {
  subscribeToPlayerState,
  PlayerPlaybackState,
  stopPlayback,
  pausePlayback,
  resumePlayback,
  setVolume,
  toggleMute,
} from "../../lib/player/player";
import { readHostSessionRaw } from "../../lib/host/session";

const AppShellInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { decks, activeDeck, loadDeck, backgroundTasks } = useDeck();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    showVideo,
    setShowVideo,
    toggleVideo,
    videoWindowBounds,
    setVideoWindowBounds,
    engineRequested,
    requestedProvider,
    requestPlayerEngine,
    releasePlayerEngine,
  } = usePlayerUI();
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const backgroundTaskEntries = Object.values(backgroundTasks);
  const backgroundTask = backgroundTaskEntries[backgroundTaskEntries.length - 1] ?? null;

  const [playerState, setPlayerState] = useState<PlayerPlaybackState | null>(null);
  const [pendingDeckSwitch, setPendingDeckSwitch] = useState<{
    deckId: string;
    deckName: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    return subscribeToPlayerState((state) => {
      setPlayerState(state);
    });
  }, []);

  const isPlaying = playerState?.state === "playing";
  const hasActiveClip = Boolean(playerState?.currentClip);
  const activeTab = activeTabFromPath(location.pathname);
  const routeDeckId = routeDeckIdFromPath(location.pathname);
  const currentDeckId = routeDeckId || activeDeck?.id || decks[0]?.id;
  const { canOpenHost, canOpenCards, hostBlockReason, cardsBlockReason } =
    useDeckNavGuards(currentDeckId);

  const isHostRoute = activeTab === "host";
  // Pre-mount YouTube while editing so the first Preview click retains its user gesture.
  const isYoutubeEditorRoute = activeTab === "editor" && activeDeck?.provider === "youtube";

  useEffect(() => {
    if (!currentDeckId) return;
    if (activeDeck?.id === currentDeckId) return;
    if (!decks.some((d) => d.id === currentDeckId)) return;
    loadDeck(currentDeckId);
  }, [currentDeckId, activeDeck?.id, decks, loadDeck]);

  useEffect(() => {
    if (isHostRoute) {
      requestPlayerEngine();
      return;
    }
    // Keep Host audio-only by default; don't leave a spoiler window open on other routes.
    setShowVideo(false);
    if (!hasActiveClip) {
      releasePlayerEngine();
    }
  }, [isHostRoute, hasActiveClip, requestPlayerEngine, releasePlayerEngine, setShowVideo]);

  useEffect(() => {
    if (isHostRoute || hasActiveClip) return;
    if (!engineRequested) return;
    releasePlayerEngine();
  }, [isHostRoute, hasActiveClip, engineRequested, releasePlayerEngine]);

  const needsYoutubeEngine =
    (isHostRoute || isYoutubeEditorRoute || hasActiveClip || engineRequested) &&
    (playerState?.currentClip?.provider ?? activeDeck?.provider ?? requestedProvider) === "youtube";
  const needsDeezerEngine =
    (isHostRoute || hasActiveClip || engineRequested) &&
    (playerState?.currentClip?.provider ?? activeDeck?.provider ?? requestedProvider) === "deezer";

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

  const switchDeck = (deckId: string) => {
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

  const handleDeckChange = (deckId: string): boolean => {
    if (deckId === currentDeckId) return false;

    const targetDeck = decks.find((d) => d.id === deckId);
    const targetName = targetDeck?.name ?? "this deck";
    const hostDeckId = activeTab === "host" ? routeDeckIdFromPath(location.pathname) : undefined;
    const hostSession = hostDeckId ? readHostSessionRaw(hostDeckId) : null;
    const hasGameInProgress = Boolean(
      hostSession &&
        (hostSession.calledHistory.length > 0 || hostSession.currentCall !== null)
    );
    const message = deckSwitchConfirmMessage({
      activeTab,
      targetName,
      hasGameInProgress,
      hasActiveClip,
    });

    if (message) {
      setPendingDeckSwitch({ deckId, deckName: targetName, message });
      return false;
    }

    switchDeck(deckId);
    return true;
  };

  const cancelDeckSwitch = () => setPendingDeckSwitch(null);

  const confirmDeckSwitch = () => {
    if (!pendingDeckSwitch) return;
    switchDeck(pendingDeckSwitch.deckId);
    setPendingDeckSwitch(null);
  };

  const handleBlockedNav = (reason: string | undefined) => {
    showToast({
      title: "Not available",
      message: reason ?? "This action is not available for the current deck.",
      duration: 4000,
    });
  };

  const renderTaskbarNav = (
    tab: string,
    to: string,
    label: string,
    icon: React.ReactNode,
    enabled: boolean,
    blockReason: string | undefined
  ) => {
    const className = `${taskbarItemClass(tab)}${enabled ? "" : " opacity-60 pointer-events-auto"}`;

    if (!enabled || !currentDeckId) {
      return (
        <button
          type="button"
          title={blockReason ?? label}
          aria-label={label}
          aria-disabled="true"
          className={className}
          onClick={() => handleBlockedNav(blockReason)}
        >
          {icon}
          <span className="text-[10px] leading-tight sm:text-inherit">{label}</span>
        </button>
      );
    }

    return (
      <NavLink to={to} title={label} aria-label={label} className={() => className}>
        {icon}
        <span className="text-[10px] leading-tight sm:text-inherit">{label}</span>
      </NavLink>
    );
  };

  const showDesktopTaskbar = isDesktopTaskbarVisible(isMobile);
  const mobileLinks: MobileNavLinkItem[] = [
    {
      id: "decks",
      label: "Decks",
      to: "/",
      end: true,
      enabled: true,
      icon: <FolderOpen className="w-4 h-4 shrink-0" />,
    },
    {
      id: "editor",
      label: "Deck",
      to: currentDeckId ? `/deck/${currentDeckId}` : "/",
      end: true,
      enabled: true,
      icon: <Edit3 className="w-4 h-4 shrink-0" />,
    },
    {
      id: "cards",
      label: "Cards",
      to: `/deck/${currentDeckId}/cards`,
      enabled: Boolean(currentDeckId) && canOpenCards,
      blockReason: cardsBlockReason,
      icon: <Printer className="w-4 h-4 shrink-0" />,
    },
    {
      id: "host",
      label: "Host",
      to: `/deck/${currentDeckId}/play`,
      enabled: Boolean(currentDeckId) && canOpenHost,
      blockReason: hostBlockReason,
      icon: <Radio className="w-4 h-4 shrink-0" />,
    },
    {
      id: "settings",
      label: "Settings",
      to: "/settings",
      enabled: true,
      icon: <Settings className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <MobileNavProvider
      enabled={isMobile}
      model={{
        activeTab,
        links: mobileLinks,
        decks: decks.map((deck) => ({ id: deck.id, name: deck.name, trackCount: deck.tracks.length })),
        currentDeckId: currentDeckId || "",
        showDeckSelector: decks.length > 0 && !isHostRoute,
        backgroundTask,
        onDeckChange: handleDeckChange,
        onBlockedNav: handleBlockedNav,
      }}
    >
    <Desktop tiled theme={theme} className={isMobile ? "pc-shell--compact" : undefined}>
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
          visible={showVideo && isHostRoute && activeDeck?.provider === "youtube"}
          bounds={videoWindowBounds}
          onBoundsChange={setVideoWindowBounds}
          onClose={() => setShowVideo(false)}
        />
      )}

      {(needsYoutubeEngine || needsDeezerEngine) && (
        <>
          {needsYoutubeEngine && <YoutubePlayerEngine />}
          {needsDeezerEngine && <DeezerAudioEngine />}
        </>
      )}

      {showDesktopTaskbar && <Taskbar className={`print:hidden${isHostRoute ? " pc-taskbar--host" : ""}`}>
        <NavLink
          to="/"
          end
          title="Decks"
          aria-label="Decks"
          className={() => taskbarItemClass("decks")}
        >
          <FolderOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="text-[10px] leading-tight sm:text-inherit">Decks</span>
        </NavLink>
        <NavLink
          to={currentDeckId ? `/deck/${currentDeckId}` : "/"}
          end
          title="Deck"
          aria-label="Deck"
          className={() => taskbarItemClass("editor")}
        >
          <Edit3 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="text-[10px] leading-tight sm:text-inherit">Deck</span>
        </NavLink>
        {renderTaskbarNav(
          "cards",
          `/deck/${currentDeckId}/cards`,
          "Cards",
          <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />,
          canOpenCards,
          cardsBlockReason
        )}
        {renderTaskbarNav(
          "host",
          `/deck/${currentDeckId}/play`,
          "Host",
          <Radio className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />,
          canOpenHost,
          hostBlockReason
        )}
        <NavLink
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className={() => taskbarItemClass("settings")}
        >
          <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="text-[10px] leading-tight sm:text-inherit">Settings</span>
        </NavLink>

        {decks.length > 0 && !isHostRoute && (
          <select
            value={currentDeckId || ""}
            onChange={(e) => handleDeckChange(e.target.value)}
            className="pc-select pc-taskbar-deck-select min-w-0 flex-1 sm:w-[420px] sm:max-w-[420px] sm:flex-none"
            title={decks.find((d) => d.id === currentDeckId)?.name ?? "Active deck"}
            aria-label="Active deck"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.tracks.length})
              </option>
            ))}
          </select>
        )}

        <div className="pc-taskbar-trailing" />
        {backgroundTask && (
          <div
            className="flex min-w-0 max-w-[15rem] items-center gap-1.5 text-[11px] opacity-80"
            role="status"
            aria-live="polite"
            title={`${backgroundTask.label} (${backgroundTask.completed}/${backgroundTask.total})`}
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="hidden truncate sm:inline">
              {backgroundTask.label} ({backgroundTask.completed}/{backgroundTask.total})
            </span>
            <span className="sm:hidden">
              {backgroundTask.completed}/{backgroundTask.total}
            </span>
          </div>
        )}
      </Taskbar>}

      {pendingDeckSwitch && (
        <PcModal title="Switch deck?" onClose={cancelDeckSwitch}>
          <p className="text-sm mb-4">{pendingDeckSwitch.message}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={cancelDeckSwitch}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirmDeckSwitch}>
              Switch to {pendingDeckSwitch.deckName}
            </Button>
          </div>
        </PcModal>
      )}
    </Desktop>
    </MobileNavProvider>
  );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PlayerUIProvider>
      <AppShellInner>{children}</AppShellInner>
    </PlayerUIProvider>
  );
};
