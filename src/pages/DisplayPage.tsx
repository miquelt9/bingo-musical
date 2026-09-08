import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDeck } from "../state/DeckContext";
import { useTheme } from "../state/ThemeContext";
import { Music2 } from "lucide-react";
import {
  buildDisplayStateFromSession,
  getDisplayChannelName,
  HOST_SESSION_KEY,
  HostDisplayState,
  readHostSessionRaw,
} from "../lib/host/session";

const EMPTY_STATE: HostDisplayState = {
  callNumber: 0,
  totalCount: 0,
  calledCount: 0,
  isRevealed: false,
  isPlaying: false,
  progress: 0,
  bingoCalled: false,
  songNumber: null,
  title: null,
  artist: null,
  albumArtUrl: null,
};

export const DisplayPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { decks, loadDeck, isLoading } = useDeck();
  const [displayState, setDisplayState] = useState<HostDisplayState>(EMPTY_STATE);

  const deck = useMemo(
    () => (id ? decks.find((d) => d.id === id) ?? null : null),
    [id, decks]
  );

  useEffect(() => {
    if (id) loadDeck(id);
  }, [id, loadDeck]);

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
      return;
    }
    if (isLoading) return;
    if (!deck) {
      navigate("/", { replace: true });
    }
  }, [id, deck, isLoading, navigate]);

  useEffect(() => {
    if (!deck) return;

    const syncFromSession = () => {
      const session = readHostSessionRaw(deck.id);
      if (!session) {
        setDisplayState({
          ...EMPTY_STATE,
          totalCount: deck.tracks.length,
        });
        return;
      }
      const next = buildDisplayStateFromSession(session, deck.tracks);
      if (next) setDisplayState(next);
    };

    syncFromSession();

    const channelName = getDisplayChannelName(deck.id);
    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => {
        const data = event.data as { type?: string; payload?: HostDisplayState };
        if (data?.type === "display-state" && data.payload) {
          setDisplayState({
            ...EMPTY_STATE,
            ...data.payload,
            bingoCalled: Boolean(data.payload.bingoCalled),
          });
        }
      };
    } catch {
      // BroadcastChannel unavailable
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === `${HOST_SESSION_KEY}.${deck.id}`) {
        syncFromSession();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [deck]);

  if (!deck) {
    return null;
  }

  const {
    callNumber,
    totalCount,
    isRevealed,
    isPlaying,
    progress,
    bingoCalled,
    songNumber,
    title,
    artist,
    albumArtUrl,
  } = displayState;

  const hasActiveCall = callNumber > 0;
  const progressPercent = Math.min(100, Math.max(0, progress * 100));

  return (
    <div
      className={`display-page display-page--${theme}${bingoCalled ? " display-page--bingo" : ""}`}
      data-theme={theme}
    >
      <div className="display-page__inner">
        <header className="display-page__header">
          <h1 className="display-page__deck-name">{deck.name}</h1>
          {hasActiveCall && !bingoCalled && (
            <p className="display-page__call-count">
              Call {callNumber} of {totalCount}
            </p>
          )}
        </header>

        <main className="display-page__main">
          {bingoCalled ? (
            <div className="display-page__bingo" role="status" aria-live="polite">
              <p className="display-page__bingo-label">BINGO!</p>
              <p className="display-page__status">Someone called bingo</p>
              <p className="display-page__bingo-pause">Playback paused — verifying card</p>
            </div>
          ) : !hasActiveCall ? (
            <div className="display-page__waiting">
              <Music2 className="display-page__icon" aria-hidden="true" />
              <p className="display-page__status">Waiting for host…</p>
            </div>
          ) : !isRevealed ? (
            <div className="display-page__listening">
              <div
                className={`display-page__mystery pc-bevel-inset${
                  isPlaying ? " display-page__mystery--pulse" : ""
                }`}
              >
                <span className="display-page__question">?</span>
              </div>
              <p className="display-page__status">
                {isPlaying ? "Listening…" : "Paused"}
              </p>
              <p className="display-page__call-hint">Call {callNumber} of {totalCount}</p>
              <div className="display-page__progress pc-bevel-inset">
                <div
                  className="display-page__progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="display-page__revealed">
              {albumArtUrl ? (
                <div className="display-page__art pc-bevel-inset">
                  <img src={albumArtUrl} alt="" />
                </div>
              ) : (
                <div className="display-page__art display-page__art--empty pc-bevel-inset">
                  <Music2 className="display-page__icon" aria-hidden="true" />
                </div>
              )}
              {songNumber != null && (
                <p className="display-page__song-number">Song #{songNumber}</p>
              )}
              <h2 className="display-page__title">{title}</h2>
              <p className="display-page__artist">{artist}</p>
              <div className="display-page__progress pc-bevel-inset">
                <div
                  className="display-page__progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
