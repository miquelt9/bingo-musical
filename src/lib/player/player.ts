import { MusicProvider } from "../../types/deck";
import * as youtube from "../youtube/player";
import * as deezer from "../deezer/player";
import { ClipPlaybackOptions, ClipEndHandler, PlayableClip, PlayerPlaybackState } from "./types";

export type { ClipPlaybackOptions, PlayableClip, PlayerPlaybackState } from "./types";

let activeProvider: MusicProvider = "youtube";
let listenersAttached = false;
const listeners = new Set<(state: PlayerPlaybackState) => void>();

let currentState: PlayerPlaybackState = {
  isReady: false,
  state: "unstarted",
  currentClip: null,
  currentTime: 0,
  duration: 0,
  progress: 0,
  remainingTime: 0,
  volume: 100,
  isMuted: false,
  errorMessage: null,
  activePlayerElementId: null,
  visiblePlayerElementId: null,
};

function notify(state: PlayerPlaybackState): void {
  currentState = state;
  for (const listener of listeners) listener({ ...state });
}

function mapYoutubeState(state: youtube.PlayerPlaybackState): PlayerPlaybackState {
  return {
    ...state,
    currentClip: state.currentClip
      ? {
          provider: "youtube",
          sourceId: state.currentClip.videoId,
          startTime: state.currentClip.startTime,
          endTime: state.currentClip.endTime,
          trackId: state.currentClip.trackId,
          title: state.currentClip.title,
          artist: state.currentClip.artist,
        }
      : null,
  };
}

function attachSubscriptions(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  youtube.subscribeToPlayerState((state) => {
    if (activeProvider === "youtube") notify(mapYoutubeState(state));
  });
  deezer.subscribeToPlayerState((state) => {
    if (activeProvider === "deezer") notify(state);
  });
}

function toYoutubeClip(clip: PlayableClip): youtube.Clip {
  return {
    videoId: clip.sourceId,
    startTime: clip.startTime,
    endTime: clip.endTime,
    trackId: clip.trackId,
    title: clip.title,
    artist: clip.artist,
  };
}

function stopOtherProvider(provider: MusicProvider): void {
  if (provider === "youtube") deezer.stopPlayback();
  else youtube.stopPlayback();
}

export function subscribeToPlayerState(listener: (state: PlayerPlaybackState) => void): () => void {
  attachSubscriptions();
  listeners.add(listener);
  listener({ ...currentState });
  return () => listeners.delete(listener);
}

export function getPlayerState(): PlayerPlaybackState {
  return { ...currentState };
}

export function playClip(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): void {
  activeProvider = clip.provider;
  stopOtherProvider(clip.provider);
  if (clip.provider === "youtube") youtube.playClip(toYoutubeClip(clip), handleEnd, options);
  else deezer.playClip(clip, handleEnd, options);
}

export function continueClipPlayback(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): boolean {
  activeProvider = clip.provider;
  if (clip.provider === "youtube") return youtube.continueClipPlayback(toYoutubeClip(clip), handleEnd, options);
  return deezer.continueClipPlayback(clip, handleEnd, options);
}

export function activatePreloadedClip(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): boolean {
  activeProvider = clip.provider;
  if (clip.provider === "youtube") return youtube.activatePreloadedClip(toYoutubeClip(clip), handleEnd, options);
  return deezer.activatePreloadedClip(clip, handleEnd, options);
}

export function preloadClip(clip: PlayableClip): void {
  if (clip.provider === "youtube") youtube.preloadClip(toYoutubeClip(clip));
  else deezer.preloadClip(clip);
}

export function clearPreload(): void {
  if (activeProvider === "youtube") youtube.clearPreload();
  else deezer.clearPreload();
}

export function pausePlayback(): void {
  if (activeProvider === "youtube") youtube.pausePlayback();
  else deezer.pausePlayback();
}

export function resumePlayback(): void {
  if (activeProvider === "youtube") youtube.resumePlayback();
  else deezer.resumePlayback();
}

export function stopPlayback(): void {
  youtube.stopPlayback();
  deezer.stopPlayback();
}

export function setVolume(volume: number): void {
  if (activeProvider === "youtube") youtube.setVolume(volume);
  else deezer.setVolume(volume);
}

export function toggleMute(): void {
  if (activeProvider === "youtube") youtube.toggleMute();
  else deezer.toggleMute();
}

export function setCrossfadeConfig(overlapMs: number, enabled: boolean): void {
  youtube.setCrossfadeConfig(overlapMs, enabled);
  deezer.setCrossfadeConfig(overlapMs, enabled);
}

export function setPlaybackFadeConfig(introMs: number, outroMs: number): void {
  youtube.setPlaybackFadeConfig(introMs, outroMs);
  deezer.setPlaybackFadeConfig(introMs, outroMs);
}

export function setPlayerPrivacyMode(hidden: boolean): void {
  youtube.setPlayerPrivacyMode(hidden);
}

export function attachPlayersToViewport(viewport: HTMLElement | null): void {
  youtube.attachPlayersToViewport(viewport);
}
