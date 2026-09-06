import { MusicProvider } from "../../types/deck";

export type PlayerStateName = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued" | "error";

export interface PlayableClip {
  provider: MusicProvider;
  sourceId: string;
  previewUrl?: string;
  startTime: number;
  endTime: number;
  trackId?: string;
  title?: string;
  artist?: string;
}

export interface PlayerPlaybackState {
  isReady: boolean;
  state: PlayerStateName;
  currentClip: PlayableClip | null;
  currentTime: number;
  duration: number;
  progress: number;
  remainingTime: number;
  volume: number;
  isMuted: boolean;
  errorMessage: string | null;
  activePlayerElementId: string | null;
  visiblePlayerElementId: string | null;
}

export interface ClipPlaybackOptions {
  fadeIn?: boolean;
  fadeOut?: boolean;
}

export type ClipEndHandler = () => void;
