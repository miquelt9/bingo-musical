declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface Clip {
  videoId: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  trackId?: string;
  title?: string;
  artist?: string;
}

export type PlayerStateName = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued" | "error";

export interface PlayerPlaybackState {
  isReady: boolean;
  state: PlayerStateName;
  currentClip: Clip | null;
  currentTime: number;
  duration: number;
  progress: number; // 0 to 1
  remainingTime: number; // in seconds
  volume: number;
  isMuted: boolean;
  errorMessage: string | null;
}

type StateListener = (state: PlayerPlaybackState) => void;
type ClipEndHandler = () => void;

let player: YT.Player | null = null;
let pollTimer: number | null = null;
let activeClip: Clip | null = null;
let onClipEndCallback: ClipEndHandler | null = null;
const stateListeners = new Set<StateListener>();

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
};

function notifyListeners() {
  for (const listener of stateListeners) {
    try {
      listener({ ...currentState });
    } catch (err) {
      console.error("Error in player state listener:", err);
    }
  }
}

export function subscribeToPlayerState(listener: StateListener): () => void {
  stateListeners.add(listener);
  listener({ ...currentState });
  return () => {
    stateListeners.delete(listener);
  };
}

export function getPlayerState(): PlayerPlaybackState {
  return { ...currentState };
}

export function loadYoutubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existingOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      existingOnReady?.();
      resolve();
    };

    if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
}

export async function mountPlayer(elementId: string): Promise<YT.Player> {
  await loadYoutubeApi();

  if (player) {
    currentState.isReady = true;
    notifyListeners();
    return player;
  }

  return new Promise<YT.Player>((resolve, reject) => {
    try {
      player = new window.YT!.Player(elementId, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            currentState.isReady = true;
            currentState.volume = player?.getVolume() ?? 100;
            currentState.isMuted = player?.isMuted() ?? false;
            notifyListeners();
            resolve(player!);
          },
          onStateChange: (e) => {
            handleStateChange(e.data);
          },
          onError: (e) => {
            handlePlayerError(e.data);
          },
        },
      });
    } catch (err) {
      currentState.errorMessage = (err as Error).message || "Failed to initialize YouTube player";
      notifyListeners();
      reject(err);
    }
  });
}

function mapYTState(data: number): PlayerStateName {
  if (!window.YT) return "unstarted";
  switch (data) {
    case window.YT.PlayerState.UNSTARTED: return "unstarted";
    case window.YT.PlayerState.ENDED: return "ended";
    case window.YT.PlayerState.PLAYING: return "playing";
    case window.YT.PlayerState.PAUSED: return "paused";
    case window.YT.PlayerState.BUFFERING: return "buffering";
    case window.YT.PlayerState.CUED: return "cued";
    default: return "unstarted";
  }
}

function handleStateChange(data: number) {
  const mapped = mapYTState(data);
  currentState.state = mapped;

  if (mapped === "playing") {
    startPoll();
  } else if (mapped === "ended") {
    finishClip();
  } else if (mapped === "paused") {
    // Keep current time
  }

  notifyListeners();
}

function handlePlayerError(code: number) {
  let msg = "Playback error";
  switch (code) {
    case 2: msg = "Invalid video ID parameter."; break;
    case 5: msg = "HTML5 player error."; break;
    case 100: msg = "Video not found or removed."; break;
    case 101:
    case 150: msg = "Video owner has disabled embedded playback."; break;
  }
  currentState.state = "error";
  currentState.errorMessage = msg;
  finishClip();
  notifyListeners();
}

function startPoll() {
  if (pollTimer) window.clearInterval(pollTimer);

  pollTimer = window.setInterval(() => {
    if (!player || !activeClip) {
      stopPoll();
      return;
    }

    try {
      const cur = player.getCurrentTime() || 0;
      const clipStart = activeClip.startTime;
      const clipEnd = activeClip.endTime;
      const clipDuration = Math.max(0.1, clipEnd - clipStart);
      const elapsed = Math.max(0, cur - clipStart);
      const remaining = Math.max(0, clipEnd - cur);
      const prog = Math.min(1, Math.max(0, elapsed / clipDuration));

      currentState.currentTime = cur;
      currentState.duration = clipDuration;
      currentState.progress = prog;
      currentState.remainingTime = remaining;

      if (cur >= clipEnd - 0.15) {
        finishClip();
      } else {
        notifyListeners();
      }
    } catch {
      // ignore transient poll error
    }
  }, 100);
}

function stopPoll() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function playClip(clip: Clip, handleEnd?: ClipEndHandler): void {
  if (!player) {
    console.warn("Player not yet mounted");
    return;
  }

  activeClip = clip;
  onClipEndCallback = handleEnd ?? null;
  currentState.currentClip = clip;
  currentState.errorMessage = null;
  currentState.progress = 0;
  currentState.remainingTime = Math.max(0, clip.endTime - clip.startTime);

  try {
    player.loadVideoById({
      videoId: clip.videoId,
      startSeconds: clip.startTime,
      endSeconds: clip.endTime,
    });
    player.playVideo();
  } catch (err) {
    console.error("Error calling loadVideoById:", err);
  }

  notifyListeners();
}

export function finishClip(): void {
  stopPoll();
  if (player) {
    try {
      player.pauseVideo();
    } catch {
      // player might not be ready
    }
  }

  currentState.state = "ended";
  currentState.progress = 1;
  currentState.remainingTime = 0;

  const cb = onClipEndCallback;
  onClipEndCallback = null;
  activeClip = null;

  notifyListeners();
  cb?.();
}

export function pausePlayback(): void {
  stopPoll();
  if (player) {
    try {
      player.pauseVideo();
    } catch {
      //
    }
  }
  currentState.state = "paused";
  notifyListeners();
}

export function resumePlayback(): void {
  if (player) {
    try {
      player.playVideo();
    } catch {
      //
    }
  }
}

export function stopPlayback(): void {
  stopPoll();
  if (player) {
    try {
      player.stopVideo();
    } catch {
      //
    }
  }
  activeClip = null;
  onClipEndCallback = null;
  currentState.currentClip = null;
  currentState.state = "unstarted";
  currentState.progress = 0;
  currentState.remainingTime = 0;
  notifyListeners();
}

export function setVolume(vol: number): void {
  if (player) {
    try {
      player.setVolume(Math.max(0, Math.min(100, vol)));
      currentState.volume = player.getVolume();
      notifyListeners();
    } catch {
      //
    }
  }
}

export function toggleMute(): void {
  if (player) {
    try {
      if (player.isMuted()) {
        player.unMute();
      } else {
        player.mute();
      }
      currentState.isMuted = player.isMuted();
      notifyListeners();
    } catch {
      //
    }
  }
}
