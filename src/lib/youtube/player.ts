declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

import { markVideoEmbedBlocked } from "./validator";

export const YOUTUBE_SLOT_WRAP_A = "youtube-slot-wrap-a";
export const YOUTUBE_SLOT_WRAP_B = "youtube-slot-wrap-b";

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
  activePlayerElementId: string | null;
  visiblePlayerElementId: string | null;
}

type StateListener = (state: PlayerPlaybackState) => void;
type ClipEndHandler = () => void;

export interface ClipPlaybackOptions {
  /** Ramp volume from 0 at clip start (e.g. first song of a hosted game). */
  fadeIn?: boolean;
  /** Ramp volume to 0 before clip end (e.g. last song / game over). */
  fadeOut?: boolean;
}

export const DEFAULT_INTRO_FADE_MS = 1500;
export const DEFAULT_OUTRO_FADE_MS = 2000;

interface PlayerSlot {
  wrapperId: string;
  container: HTMLElement;
  player: YT.Player | null;
  clip: Clip | null;
  preloadedClip: Clip | null;
}

const PLAYER_VARS: YT.PlayerVars = {
  autoplay: 0,
  controls: 1,
  modestbranding: 1,
  rel: 0,
  playsinline: 1,
  enablejsapi: 1,
  origin: typeof window !== "undefined" ? window.location.origin : "",
};

let slots: [PlayerSlot, PlayerSlot] | null = null;
let playerMountCount = 0;
let activeSlotIndex = 0;
let pollTimer: number | null = null;
let activeClip: Clip | null = null;
let chainClip: Clip | null = null;
let onClipEndCallback: ClipEndHandler | null = null;
let chainEndFired = false;
const stateListeners = new Set<StateListener>();

let crossfadeOverlapMs = 0;
let crossfadeEnabled = false;
let crossfadeInProgress = false;
let crossfadeRafId: number | null = null;
let visibleSlotIndex = 0;
let muteApplyRaf: number | null = null;

let introFadeMs = DEFAULT_INTRO_FADE_MS;
let outroFadeMs = DEFAULT_OUTRO_FADE_MS;
let playbackFadeIn = false;
let playbackFadeOut = false;
let outroFadeInProgress = false;
let volumeRampRafId: number | null = null;

let fallbackContainer: HTMLElement | null = null;
let attachedViewport: HTMLElement | null = null;

interface PendingPlayRequest {
  clip: Clip;
  handleEnd?: ClipEndHandler;
  options?: ClipPlaybackOptions;
}

let pendingPlay: PendingPlayRequest | null = null;

function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window
  );
}

function getPlayersRoot(): HTMLElement | null {
  return slots?.[0]?.container.parentElement ?? null;
}

function refreshAllPlayerSizes(): void {
  if (!slots) return;
  refreshPlayerSize(slots[0]);
  refreshPlayerSize(slots[1]);
}

export function setPlayerFallbackContainer(el: HTMLElement | null): void {
  fallbackContainer = el;
  if (!attachedViewport && el) {
    const root = getPlayersRoot();
    if (root && root.parentElement !== el) {
      el.appendChild(root);
      refreshAllPlayerSizes();
    }
  }
}

/** Move the shared player DOM into a visible viewport, or back to the hidden fallback. */
export function attachPlayersToViewport(viewport: HTMLElement | null): void {
  const root = getPlayersRoot();
  if (!root) return;

  if (viewport) {
    if (root.parentElement !== viewport) {
      viewport.appendChild(root);
    }
    attachedViewport = viewport;
    refreshAllPlayerSizes();
    return;
  }

  attachedViewport = null;
  const target = fallbackContainer;
  if (target && root.parentElement !== target) {
    target.appendChild(root);
    refreshAllPlayerSizes();
  }
}

function flushPendingPlay(): void {
  if (!pendingPlay || !currentState.isReady || !getActiveSlot()?.player) return;
  const request = pendingPlay;
  pendingPlay = null;
  playClip(request.clip, request.handleEnd, request.options);
}

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

function getActiveSlot(): PlayerSlot | null {
  return slots?.[activeSlotIndex] ?? null;
}

function getStandbySlot(): PlayerSlot | null {
  if (!slots) return null;
  return slots[activeSlotIndex === 0 ? 1 : 0];
}

function getSlotPlayer(slot: PlayerSlot | null): YT.Player | null {
  return slot?.player ?? null;
}

function notifyListeners() {
  for (const listener of stateListeners) {
    try {
      listener({ ...currentState });
    } catch (err) {
      console.error("Error in player state listener:", err);
    }
  }
}

function updateActiveElementId() {
  currentState.activePlayerElementId = getActiveSlot()?.wrapperId ?? null;
}

function getSlotByIndex(index: number): PlayerSlot | null {
  return slots?.[index] ?? null;
}

function applyVisibleSlotClasses(index: number): void {
  if (!slots) return;
  slots[0].container.classList.toggle("video-window-player-slot--active", index === 0);
  slots[0].container.classList.toggle("video-window-player-slot--standby", index !== 0);
  slots[1].container.classList.toggle("video-window-player-slot--active", index === 1);
  slots[1].container.classList.toggle("video-window-player-slot--standby", index !== 1);
}

function refreshPlayerSize(slot: PlayerSlot | null): void {
  if (!slot?.player) return;
  const w = slot.container.clientWidth;
  const h = slot.container.clientHeight;
  if (w <= 0 || h <= 0) return;
  try {
    slot.player.setSize(w, h);
  } catch {
    // ignore
  }
}

function setVisibleSlot(index: number): void {
  visibleSlotIndex = index;
  const slot = getSlotByIndex(index);
  currentState.visiblePlayerElementId = slot?.wrapperId ?? null;
  applyVisibleSlotClasses(index);
  refreshPlayerSize(slot);
}

function syncVisibleToActive(): void {
  setVisibleSlot(activeSlotIndex);
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

export function getVisiblePlayerSlotIndex(): number {
  return visibleSlotIndex;
}

export function setCrossfadeConfig(overlapMs: number, enabled: boolean): void {
  crossfadeOverlapMs = Math.max(0, Math.min(3000, overlapMs));
  crossfadeEnabled = enabled;
}

export function setPlaybackFadeConfig(introMs: number, outroMs: number): void {
  introFadeMs = Math.max(0, Math.min(5000, introMs));
  outroFadeMs = Math.max(0, Math.min(5000, outroMs));
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

function createPlayer(container: HTMLElement, slotIndex: number): Promise<YT.Player> {
  const mount = document.createElement("div");
  mount.className = "youtube-player-mount";
  container.appendChild(mount);

  return new Promise<YT.Player>((resolve, reject) => {
    try {
      const ytPlayer = new window.YT!.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: PLAYER_VARS,
        events: {
          onReady: () => {
            if (slotIndex === activeSlotIndex) {
              currentState.isReady = true;
              currentState.volume = ytPlayer.getVolume() ?? 100;
              currentState.isMuted = ytPlayer.isMuted() ?? false;
              updateActiveElementId();
              notifyListeners();
            }
            resolve(ytPlayer);
          },
          onStateChange: (e) => {
            handleStateChange(e.data, slotIndex);
          },
          onError: (e) => {
            handlePlayerError(e.data, slotIndex);
          },
        },
      });
    } catch (err) {
      if (slotIndex === activeSlotIndex) {
        currentState.errorMessage = (err as Error).message || "Failed to initialize YouTube player";
        notifyListeners();
      }
      reject(err);
    }
  });
}

function areSlotsMounted(): boolean {
  if (!slots) return false;
  return (
    slots[0].player != null &&
    slots[1].player != null &&
    slots[0].container.isConnected &&
    slots[1].container.isConnected
  );
}

export async function mountDualPlayers(
  wrapA: HTMLElement,
  wrapB: HTMLElement
): Promise<void> {
  playerMountCount += 1;
  await loadYoutubeApi();

  if (slots && areSlotsMounted()) {
    currentState.isReady = true;
    setVisibleSlot(visibleSlotIndex);
    updateActiveElementId();
    notifyListeners();
    flushPendingPlay();
    return;
  }

  destroyPlayers();

  slots = [
    { wrapperId: YOUTUBE_SLOT_WRAP_A, container: wrapA, player: null, clip: null, preloadedClip: null },
    { wrapperId: YOUTUBE_SLOT_WRAP_B, container: wrapB, player: null, clip: null, preloadedClip: null },
  ];
  activeSlotIndex = 0;
  visibleSlotIndex = 0;

  const [primaryPlayer, standbyPlayer] = await Promise.all([
    createPlayer(wrapA, 0),
    createPlayer(wrapB, 1),
  ]);

  if (!slots) return;
  slots[0].player = primaryPlayer;
  slots[1].player = standbyPlayer;
  setVisibleSlot(0);
  updateActiveElementId();
  notifyListeners();
  flushPendingPlay();
}

/** @deprecated Use mountDualPlayers with wrapper elements */
export async function mountPlayer(elementId: string): Promise<YT.Player> {
  let wrapA = document.getElementById(elementId);
  if (!wrapA) {
    wrapA = document.createElement("div");
    wrapA.id = elementId;
    document.body.appendChild(wrapA);
  }
  let wrapB = document.getElementById(`${elementId}-standby`);
  if (!wrapB) {
    wrapB = document.createElement("div");
    wrapB.id = `${elementId}-standby`;
    document.body.appendChild(wrapB);
  }
  await mountDualPlayers(wrapA, wrapB);
  return getSlotPlayer(getActiveSlot())!;
}

function destroyPlayers(): void {
  cancelCrossfade();
  cancelVolumeRamp();
  cancelMuteApply();
  stopPoll();
  if (slots) {
    for (const slot of slots) {
      try {
        slot.player?.destroy();
      } catch {
        // ignore
      }
      slot.container.replaceChildren();
    }
  }
  slots = null;
}

/** Release a player mount; tears down iframes when the last mount is released. */
export function teardownYoutubePlayers(): void {
  playerMountCount = Math.max(0, playerMountCount - 1);
  if (playerMountCount === 0) {
    stopPlayback();
    destroyPlayers();
  }
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

function handleStateChange(data: number, slotIndex: number) {
  const mapped = mapYTState(data);

  if (slotIndex === visibleSlotIndex && (mapped === "playing" || mapped === "buffering")) {
    refreshPlayerSize(slots?.[slotIndex] ?? null);
  }

  if (slotIndex !== activeSlotIndex) {
    if (mapped === "playing" && !crossfadeInProgress) {
      try {
        slots?.[slotIndex]?.player?.pauseVideo();
      } catch {
        // ignore standby bleed during preload
      }
    }
    return;
  }
  currentState.state = mapped;

  if (mapped === "playing") {
    startPoll();
  } else if (mapped === "ended") {
    finishClip();
  }

  notifyListeners();
}

function handlePlayerError(code: number, slotIndex: number) {
  if (slotIndex !== activeSlotIndex) return;

  let msg = "Playback error";
  switch (code) {
    case 2: msg = "Invalid video ID parameter."; break;
    case 5: msg = "HTML5 player error."; break;
    case 100: msg = "Video not found or removed."; break;
    case 101:
    case 150:
      msg = window.location.hostname === "127.0.0.1"
        ? "Playback blocked by YouTube on 127.0.0.1. Please access via http://localhost:5173/."
        : "Video owner has disabled embedded playback.";
      break;
    case 153:
      msg = "YouTube blocked embedder identification. Please ensure localhost domain or valid referrer is used.";
      break;
  }
  const erroredClip = activeClip ?? slots?.[slotIndex]?.clip ?? null;
  if (erroredClip?.videoId && (code === 100 || code === 101 || code === 150)) {
    markVideoEmbedBlocked(erroredClip.videoId, msg);
  }
  currentState.state = "error";
  currentState.errorMessage = msg;
  finishClip();
  notifyListeners();
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function setSlotVolume(slot: PlayerSlot, volume: number): void {
  if (!slot.player) return;
  try {
    const vol = Math.round(Math.max(0, Math.min(100, volume)));
    if (currentState.isMuted) {
      slot.player.mute();
    } else {
      slot.player.unMute();
      slot.player.setVolume(vol);
    }
  } catch {
    // ignore
  }
}

function applyVolumeToBothSlots(): void {
  if (!slots) return;
  const vol = currentState.isMuted ? 0 : currentState.volume;
  for (const slot of slots) {
    if (slot.player && slot !== getActiveSlot()) {
      setSlotVolume(slot, 0);
    }
  }
  const active = getActiveSlot();
  if (active) setSlotVolume(active, vol);
}

function cancelMuteApply(): void {
  if (muteApplyRaf !== null) {
    cancelAnimationFrame(muteApplyRaf);
    muteApplyRaf = null;
  }
}

function scheduleMuteApply(): void {
  cancelMuteApply();
  muteApplyRaf = requestAnimationFrame(() => {
    muteApplyRaf = null;
    applyVolumeToBothSlots();
  });
}

function cancelCrossfade(): void {
  if (crossfadeRafId !== null) {
    cancelAnimationFrame(crossfadeRafId);
    crossfadeRafId = null;
  }
  crossfadeInProgress = false;
}

function cancelVolumeRamp(): void {
  if (volumeRampRafId !== null) {
    cancelAnimationFrame(volumeRampRafId);
    volumeRampRafId = null;
  }
  outroFadeInProgress = false;
}

function getTargetVolume(): number {
  return currentState.isMuted ? 0 : currentState.volume;
}

function applyClipPlaybackOptions(options?: ClipPlaybackOptions): void {
  if (!options) return;
  const touchDevice = isCoarsePointerDevice();
  if (options.fadeIn != null) playbackFadeIn = touchDevice ? false : options.fadeIn;
  if (options.fadeOut != null) playbackFadeOut = touchDevice ? false : options.fadeOut;
  outroFadeInProgress = false;
}

function rampSlotVolume(
  slot: PlayerSlot,
  fromVol: number,
  toVol: number,
  durationMs: number,
  onComplete?: () => void
): void {
  cancelVolumeRamp();
  if (durationMs <= 0 || Math.abs(fromVol - toVol) < 0.5) {
    setSlotVolume(slot, toVol);
    onComplete?.();
    return;
  }

  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / durationMs);
    const eased = easeInOut(t);
    setSlotVolume(slot, lerp(fromVol, toVol, eased));

    if (t < 1) {
      volumeRampRafId = requestAnimationFrame(tick);
      return;
    }

    volumeRampRafId = null;
    onComplete?.();
  };

  volumeRampRafId = requestAnimationFrame(tick);
}

function startIntroFade(slot: PlayerSlot): void {
  if (!playbackFadeIn || introFadeMs <= 0 || crossfadeInProgress) return;
  const target = getTargetVolume();
  setSlotVolume(slot, 0);
  rampSlotVolume(slot, 0, target, introFadeMs);
}

function maybeStartOutroFade(remainingSec: number): boolean {
  if (!playbackFadeOut || outroFadeInProgress || crossfadeInProgress || !activeClip) {
    return false;
  }

  const remainingMs = remainingSec * 1000;
  if (remainingMs > outroFadeMs + 50) return false;

  const active = getActiveSlot();
  if (!active?.player) return false;

  outroFadeInProgress = true;
  stopPoll();

  const fadeDuration = Math.max(remainingMs, 100);
  const startVol = getTargetVolume();
  rampSlotVolume(active, startVol, 0, fadeDuration, () => {
    outroFadeInProgress = false;
    finishClip();
  });
  return true;
}

function getEffectiveOverlapMs(clip: Clip): number {
  if (!crossfadeEnabled || crossfadeOverlapMs <= 0) return 0;
  const clipDurationMs = Math.max(0, clip.endTime - clip.startTime) * 1000;
  const maxOverlap = clipDurationMs * 0.4;
  return Math.min(crossfadeOverlapMs, maxOverlap);
}

function commitSlotSwap(incomingClip: Clip): void {
  const outgoing = getActiveSlot();
  const incoming = getStandbySlot();
  if (!outgoing || !incoming) return;

  try {
    outgoing.player?.pauseVideo();
  } catch {
    // ignore
  }

  outgoing.clip = null;
  incoming.clip = incomingClip;
  incoming.preloadedClip = null;

  activeSlotIndex = activeSlotIndex === 0 ? 1 : 0;
  activeClip = incomingClip;
  currentState.currentClip = incomingClip;
  updateActiveElementId();
  setVisibleSlot(activeSlotIndex);

  const vol = currentState.isMuted ? 0 : currentState.volume;
  setSlotVolume(incoming, vol);
  setSlotVolume(outgoing, 0);
}

function loadClipOnPlayer(player: YT.Player, clip: Clip): void {
  player.loadVideoById({
    videoId: clip.videoId,
    startSeconds: clip.startTime,
    endSeconds: clip.endTime,
  });
}

function isClipLoadedOnPlayer(player: YT.Player, clip: Clip): boolean {
  try {
    const data = player.getVideoData();
    return data?.video_id === clip.videoId;
  } catch {
    return false;
  }
}

function syncPlayerToClipStart(player: YT.Player, clip: Clip): void {
  const t = typeof player.getCurrentTime === "function" ? player.getCurrentTime() || 0 : 0;
  if (t < clip.startTime - 0.4 || t >= clip.endTime - 0.2) {
    player.seekTo(clip.startTime, true);
  }
}

function updateProgressFromPlayer(player: YT.Player, clip: Clip): void {
  const cur = typeof player.getCurrentTime === "function" ? player.getCurrentTime() || clip.startTime : clip.startTime;
  const clipDuration = Math.max(0.1, clip.endTime - clip.startTime);
  const elapsed = Math.max(0, cur - clip.startTime);
  currentState.currentTime = cur;
  currentState.duration = clipDuration;
  currentState.progress = Math.min(1, Math.max(0, elapsed / clipDuration));
  currentState.remainingTime = Math.max(0, clip.endTime - cur);
}

function startIncomingPlayback(incoming: PlayerSlot, incomingClip: Clip): void {
  incoming.preloadedClip = null;
  if (!incoming.player) return;

  if (!isClipLoadedOnPlayer(incoming.player, incomingClip)) {
    loadClipOnPlayer(incoming.player, incomingClip);
  } else {
    syncPlayerToClipStart(incoming.player, incomingClip);
  }

  setSlotVolume(incoming, 0);
  incoming.player.playVideo();
}

function handoffChainToClip(clip: Clip, handleEnd: ClipEndHandler | null): void {
  chainClip = clip;
  chainEndFired = false;
  onClipEndCallback = handleEnd;
}

function startCrossfade(incomingClip: Clip): void {
  if (crossfadeInProgress) return;

  const outgoing = getActiveSlot();
  const incoming = getStandbySlot();
  if (!outgoing?.player || !incoming?.player) return;

  const overlapMs = getEffectiveOverlapMs(chainClip ?? activeClip ?? incomingClip);
  if (overlapMs <= 0) return;

  crossfadeInProgress = true;
  cancelVolumeRamp();
  incoming.clip = incomingClip;

  const incomingIndex = activeSlotIndex === 0 ? 1 : 0;
  setVisibleSlot(incomingIndex);
  notifyListeners();

  try {
    startIncomingPlayback(incoming, incomingClip);
  } catch (err) {
    console.error("Error starting crossfade:", err);
    crossfadeInProgress = false;
    syncVisibleToActive();
    return;
  }

  const targetVolume = currentState.isMuted ? 0 : currentState.volume;
  const outgoingStartVol = targetVolume;
  const t0 = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / overlapMs);
    const eased = easeInOut(t);
    setSlotVolume(outgoing, lerp(outgoingStartVol, 0, eased));
    setSlotVolume(incoming, lerp(0, targetVolume, eased));

    if (t < 1) {
      crossfadeRafId = requestAnimationFrame(tick);
      return;
    }

    crossfadeRafId = null;
    crossfadeInProgress = false;
    const chainCb = onClipEndCallback;
    commitSlotSwap(incomingClip);
    currentState.state = "playing";
    fireChainEndIfNeeded();
    handoffChainToClip(incomingClip, chainCb);
    startPoll();
    notifyListeners();
  };

  crossfadeRafId = requestAnimationFrame(tick);
}

function maybeTriggerCrossfade(remainingSec: number): void {
  if (!crossfadeEnabled || crossfadeInProgress || !chainClip) return;

  const overlapMs = getEffectiveOverlapMs(chainClip);
  if (overlapMs <= 0) return;

  const standby = getStandbySlot();
  const nextClip = standby?.preloadedClip;
  if (!nextClip) return;

  if (remainingSec * 1000 <= overlapMs + 50) {
    startCrossfade(nextClip);
  }
}

function fireChainEndIfNeeded(): void {
  if (chainEndFired || !chainClip) return;
  chainEndFired = true;

  const cb = onClipEndCallback;
  onClipEndCallback = null;
  chainClip = null;

  const activePlayer = getActiveSlot()?.player;
  const stillPlaying =
    activePlayer != null &&
    mapYTState(activePlayer.getPlayerState()) === "playing";

  if (!stillPlaying) {
    currentState.state = "ended";
    currentState.progress = 1;
    currentState.remainingTime = 0;
  }

  notifyListeners();
  cb?.();
}

function startPoll() {
  if (pollTimer) window.clearInterval(pollTimer);

  pollTimer = window.setInterval(() => {
    const active = getActiveSlot();
    const player = active?.player;
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

      maybeTriggerCrossfade(remaining);

      if (maybeStartOutroFade(remaining)) {
        return;
      }

      if (cur >= clipEnd - 0.15) {
        if (chainClip && !chainEndFired && !crossfadeInProgress) {
          finishClip();
        } else if (!chainClip) {
          finishClip();
        } else {
          notifyListeners();
        }
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

export function preloadClip(clip: Clip): void {
  const standby = getStandbySlot();
  if (!standby?.player) return;

  standby.preloadedClip = clip;
  try {
    loadClipOnPlayer(standby.player, clip);
    setSlotVolume(standby, 0);
    standby.player.pauseVideo();
  } catch (err) {
    console.error("Error preloading clip:", err);
    standby.preloadedClip = clip;
  }
}

export function clearPreload(): void {
  const standby = getStandbySlot();
  if (standby) standby.preloadedClip = null;
}

export function continueClipPlayback(
  clip: Clip,
  handleEnd?: ClipEndHandler,
  options?: ClipPlaybackOptions
): boolean {
  if (currentState.currentClip?.trackId !== clip.trackId) return false;
  if (
    currentState.state !== "playing" &&
    currentState.state !== "buffering" &&
    currentState.state !== "paused"
  ) {
    return false;
  }

  handoffChainToClip(clip, handleEnd ?? null);
  applyClipPlaybackOptions(options);
  activeClip = clip;
  const active = getActiveSlot();
  if (active) active.clip = clip;

  if (currentState.state === "paused") {
    try {
      active?.player?.playVideo();
      currentState.state = "playing";
    } catch {
      return false;
    }
  }

  if (active?.player) {
    updateProgressFromPlayer(active.player, clip);
  }

  startPoll();
  notifyListeners();
  return true;
}

export function activatePreloadedClip(
  clip: Clip,
  handleEnd?: ClipEndHandler,
  options?: ClipPlaybackOptions
): boolean {
  if (continueClipPlayback(clip, handleEnd, options)) return true;

  const standby = getStandbySlot();
  if (!standby?.player) return false;
  if (standby.preloadedClip && standby.preloadedClip.trackId !== clip.trackId) return false;

  cancelCrossfade();
  cancelVolumeRamp();

  const outgoing = getActiveSlot();
  if (outgoing?.player) {
    try {
      outgoing.player.stopVideo();
    } catch {
      // ignore
    }
    outgoing.clip = null;
    outgoing.preloadedClip = null;
  }

  standby.clip = clip;
  standby.preloadedClip = null;
  activeSlotIndex = activeSlotIndex === 0 ? 1 : 0;
  activeClip = clip;
  chainClip = clip;
  chainEndFired = false;
  onClipEndCallback = handleEnd ?? null;
  applyClipPlaybackOptions(options);

  currentState.currentClip = clip;
  currentState.errorMessage = null;
  updateActiveElementId();
  setVisibleSlot(activeSlotIndex);

  if (playbackFadeIn && introFadeMs > 0) {
    setSlotVolume(standby, 0);
    const other = getStandbySlot();
    if (other) setSlotVolume(other, 0);
  } else {
    applyVolumeToBothSlots();
  }

  try {
    if (!isClipLoadedOnPlayer(standby.player, clip)) {
      loadClipOnPlayer(standby.player, clip);
      currentState.progress = 0;
      currentState.remainingTime = Math.max(0, clip.endTime - clip.startTime);
    } else {
      syncPlayerToClipStart(standby.player, clip);
      updateProgressFromPlayer(standby.player, clip);
    }
    standby.player.playVideo();
    currentState.state = "playing";
    startPoll();
    if (playbackFadeIn && introFadeMs > 0) {
      startIntroFade(standby);
    }
  } catch (err) {
    console.error("Error activating preloaded clip:", err);
    return false;
  }

  notifyListeners();
  return true;
}

export function updateClipEndHandler(clip: Clip, handleEnd?: ClipEndHandler): void {
  activeClip = clip;
  chainClip = clip;
  chainEndFired = false;
  onClipEndCallback = handleEnd ?? null;
  currentState.currentClip = clip;
  currentState.errorMessage = null;
  updateActiveElementId();
  notifyListeners();
}

export function playClip(
  clip: Clip,
  handleEnd?: ClipEndHandler,
  options?: ClipPlaybackOptions
): void {
  const active = getActiveSlot();
  if (!active?.player || !currentState.isReady) {
    pendingPlay = { clip, handleEnd, options };
    return;
  }

  if (continueClipPlayback(clip, handleEnd, options)) return;

  cancelCrossfade();
  cancelVolumeRamp();
  clearPreload();

  const standby = getStandbySlot();
  if (standby?.player) {
    try {
      standby.player.stopVideo();
    } catch {
      // ignore
    }
    standby.clip = null;
    standby.preloadedClip = null;
  }

  activeSlotIndex = active === slots?.[0] ? 0 : 1;
  activeClip = clip;
  chainClip = clip;
  chainEndFired = false;
  onClipEndCallback = handleEnd ?? null;
  applyClipPlaybackOptions(options);
  active.clip = clip;

  currentState.currentClip = clip;
  currentState.errorMessage = null;
  currentState.progress = 0;
  currentState.remainingTime = Math.max(0, clip.endTime - clip.startTime);
  updateActiveElementId();
  setVisibleSlot(activeSlotIndex);

  if (playbackFadeIn && introFadeMs > 0) {
    setSlotVolume(active, 0);
    const standby = getStandbySlot();
    if (standby) setSlotVolume(standby, 0);
  } else {
    applyVolumeToBothSlots();
  }

  try {
    loadClipOnPlayer(active.player, clip);
    active.player.playVideo();
    if (playbackFadeIn && introFadeMs > 0) {
      startIntroFade(active);
    }
  } catch (err) {
    console.error("Error calling loadVideoById:", err);
  }

  notifyListeners();
}

export function finishClip(clearClip = true): void {
  if (outroFadeInProgress) return;

  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();

  const active = getActiveSlot();
  if (active?.player) {
    try {
      active.player.pauseVideo();
    } catch {
      // ignore
    }
  }

  if (clearClip) {
    currentState.state = "ended";
    currentState.progress = 1;
    currentState.remainingTime = 0;

    const cb = onClipEndCallback;
    onClipEndCallback = null;
    activeClip = null;
    chainClip = null;
    chainEndFired = false;
    playbackFadeIn = false;
    playbackFadeOut = false;
    if (active) active.clip = null;

    notifyListeners();
    cb?.();
  }
}

export function pausePlayback(): void {
  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();
  if (slots) {
    for (const slot of slots) {
      try {
        slot.player?.pauseVideo();
      } catch {
        // ignore
      }
    }
  }
  currentState.state = "paused";
  notifyListeners();
}

export function resumePlayback(): void {
  const active = getActiveSlot();
  if (!active?.player) {
    if (currentState.currentClip) {
      playClip(currentState.currentClip, onClipEndCallback ?? undefined);
    }
    return;
  }

  if (currentState.currentClip) {
    const curTime = typeof active.player.getCurrentTime === "function" ? active.player.getCurrentTime() || 0 : 0;
    const isPastEnd = curTime >= currentState.currentClip.endTime - 0.2;
    const isBeforeStart = curTime < currentState.currentClip.startTime - 0.5;
    const isEndedOrError =
      currentState.state === "ended" ||
      currentState.state === "error" ||
      currentState.state === "unstarted";

    if (isPastEnd || isBeforeStart || isEndedOrError) {
      playClip(currentState.currentClip, onClipEndCallback ?? undefined);
      return;
    }
  }

  try {
    active.player.playVideo();
    currentState.state = "playing";
    startPoll();
    notifyListeners();
  } catch (err) {
    console.error("Error resuming playback:", err);
    if (currentState.currentClip) {
      playClip(currentState.currentClip, onClipEndCallback ?? undefined);
    }
  }
}

export function stopPlayback(): void {
  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();
  if (slots) {
    for (const slot of slots) {
      try {
        slot.player?.stopVideo();
      } catch {
        // ignore
      }
      slot.clip = null;
      slot.preloadedClip = null;
    }
  }
  activeClip = null;
  chainClip = null;
  chainEndFired = false;
  onClipEndCallback = null;
  playbackFadeIn = false;
  playbackFadeOut = false;
  currentState.currentClip = null;
  currentState.state = "unstarted";
  currentState.progress = 0;
  currentState.remainingTime = 0;
  notifyListeners();
}

export function setVolume(vol: number): void {
  const clamped = Math.max(0, Math.min(100, vol));
  currentState.volume = clamped;
  if (clamped > 0) {
    currentState.isMuted = false;
  } else {
    currentState.isMuted = true;
  }
  if (!crossfadeInProgress && volumeRampRafId === null) {
    applyVolumeToBothSlots();
    if (getActiveSlot()?.player) {
      try {
        currentState.volume = getActiveSlot()!.player!.getVolume();
      } catch {
        // ignore
      }
    }
  }
  notifyListeners();
}

export function toggleMute(): void {
  if (!slots) return;

  currentState.isMuted = !currentState.isMuted;
  notifyListeners();
  scheduleMuteApply();
}
