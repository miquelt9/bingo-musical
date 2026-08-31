import { Track } from "../../types/deck";

export const HOST_SESSION_KEY = "bingo.host.session";
export const DISPLAY_CHANNEL_PREFIX = "bingo.host.display";

export interface SerializedCalledEntry {
  callNumber: number;
  trackId: string;
  calledAt: string;
}

export interface HostSessionData {
  uncalledIds: string[];
  calledHistory: SerializedCalledEntry[];
  currentCall: SerializedCalledEntry | null;
  isRevealed: boolean;
  autoRevealOnEnd: boolean;
  autoCallNextOnEnd: boolean;
}

export interface HostDisplayState {
  callNumber: number;
  totalCount: number;
  calledCount: number;
  isRevealed: boolean;
  isPlaying: boolean;
  progress: number;
  title: string | null;
  artist: string | null;
  albumArtUrl: string | null;
}

export function getDisplayChannelName(deckId: string): string {
  return `${DISPLAY_CHANNEL_PREFIX}.${deckId}`;
}

export function readHostSessionRaw(deckId: string): HostSessionData | null {
  try {
    const raw = sessionStorage.getItem(`${HOST_SESSION_KEY}.${deckId}`);
    if (!raw) return null;
    return JSON.parse(raw) as HostSessionData;
  } catch {
    return null;
  }
}

export function buildDisplayStateFromSession(
  session: HostSessionData,
  tracks: Track[],
  playback?: { isPlaying: boolean; progress: number }
): HostDisplayState | null {
  const totalCount = tracks.length;
  if (totalCount === 0) return null;

  const calledCount = session.calledHistory?.length ?? 0;
  const current = session.currentCall;
  if (!current) {
    return {
      callNumber: 0,
      totalCount,
      calledCount,
      isRevealed: false,
      isPlaying: false,
      progress: 0,
      title: null,
      artist: null,
      albumArtUrl: null,
    };
  }

  const track = tracks.find((t) => t.id === current.trackId);
  if (!track) return null;

  const isRevealed = session.isRevealed ?? false;

  return {
    callNumber: current.callNumber,
    totalCount,
    calledCount,
    isRevealed,
    isPlaying: playback?.isPlaying ?? false,
    progress: playback?.progress ?? 0,
    title: isRevealed ? track.title : null,
    artist: isRevealed ? track.artist : null,
    albumArtUrl: isRevealed ? track.albumArtUrl : null,
  };
}
