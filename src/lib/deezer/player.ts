import { ClipPlaybackOptions, ClipEndHandler, PlayableClip, PlayerPlaybackState } from "../player/types";

export const DEEZER_SLOT_WRAP_A = "deezer-slot-wrap-a";
export const DEEZER_SLOT_WRAP_B = "deezer-slot-wrap-b";
export const DEFAULT_INTRO_FADE_MS = 1500;
export const DEFAULT_OUTRO_FADE_MS = 2000;

type StateListener = (state: PlayerPlaybackState) => void;

interface AudioSlot {
  wrapperId: string;
  container: HTMLElement;
  audio: HTMLAudioElement;
  clip: PlayableClip | null;
  preloadedClip: PlayableClip | null;
}

let slots: [AudioSlot, AudioSlot] | null = null;
let activeSlotIndex = 0;
let pollTimer: number | null = null;
let crossfadeRafId: number | null = null;
let volumeRampRafId: number | null = null;
let activeClip: PlayableClip | null = null;
let onClipEndCallback: ClipEndHandler | null = null;
let chainEndFired = false;
let crossfadeInProgress = false;
let crossfadeOverlapMs = 0;
let crossfadeEnabled = false;
let introFadeMs = DEFAULT_INTRO_FADE_MS;
let outroFadeMs = DEFAULT_OUTRO_FADE_MS;
let playbackFadeIn = false;
let playbackFadeOut = false;
let outroFadeInProgress = false;
/** True only after the active clip has reached a real `playing` event. */
let playbackStarted = false;
let pendingPlay: { clip: PlayableClip; handleEnd?: ClipEndHandler; options?: ClipPlaybackOptions } | null = null;
const listeners = new Set<StateListener>();

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

function notify(): void {
  for (const listener of listeners) listener({ ...currentState });
}

function getActiveSlot(): AudioSlot | null {
  return slots?.[activeSlotIndex] ?? null;
}

function getStandbySlot(): AudioSlot | null {
  return slots?.[activeSlotIndex === 0 ? 1 : 0] ?? null;
}

function getTargetVolume(): number {
  return currentState.isMuted ? 0 : currentState.volume;
}

function setAudioVolume(slot: AudioSlot, value: number): void {
  slot.audio.volume = Math.max(0, Math.min(1, value / 100));
  slot.audio.muted = currentState.isMuted;
}

function setBothVolumes(): void {
  if (!slots) return;
  setAudioVolume(slots[0], slots[0] === getActiveSlot() ? getTargetVolume() : 0);
  setAudioVolume(slots[1], slots[1] === getActiveSlot() ? getTargetVolume() : 0);
}

function stopPoll(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = null;
}

function cancelCrossfade(): void {
  if (crossfadeRafId !== null) cancelAnimationFrame(crossfadeRafId);
  crossfadeRafId = null;
  crossfadeInProgress = false;
}

function cancelVolumeRamp(): void {
  if (volumeRampRafId !== null) cancelAnimationFrame(volumeRampRafId);
  volumeRampRafId = null;
  outroFadeInProgress = false;
}

function updateProgress(): number {
  if (!activeClip) return 0;
  const slot = getActiveSlot();
  const current = slot?.audio.currentTime || activeClip.startTime;
  const duration = Math.max(0.1, activeClip.endTime - activeClip.startTime);
  currentState.currentTime = current;
  currentState.duration = duration;
  currentState.progress = Math.min(1, Math.max(0, (current - activeClip.startTime) / duration));
  currentState.remainingTime = Math.max(0, activeClip.endTime - current);
  return currentState.remainingTime;
}

function fadeSlot(slot: AudioSlot, from: number, to: number, durationMs: number, done?: () => void): void {
  cancelVolumeRamp();
  if (durationMs <= 0 || Math.abs(from - to) < 0.5) {
    setAudioVolume(slot, to);
    done?.();
    return;
  }
  const started = performance.now();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - started) / durationMs);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    setAudioVolume(slot, from + (to - from) * eased);
    if (progress < 1) volumeRampRafId = requestAnimationFrame(tick);
    else {
      volumeRampRafId = null;
      done?.();
    }
  };
  volumeRampRafId = requestAnimationFrame(tick);
}

function applyOptions(options?: ClipPlaybackOptions): void {
  if (!options) return;
  if (options.fadeIn !== undefined) playbackFadeIn = options.fadeIn;
  if (options.fadeOut !== undefined) playbackFadeOut = options.fadeOut;
  outroFadeInProgress = false;
}

function loadAudio(slot: AudioSlot, clip: PlayableClip): void {
  if (!clip.previewUrl) throw new Error("This Deezer track has no playable preview.");
  slot.audio.pause();
  if (slot.audio.src !== clip.previewUrl) {
    slot.audio.src = clip.previewUrl;
    slot.audio.load();
  }
  try {
    slot.audio.currentTime = clip.startTime;
  } catch {
    // Metadata may not be available yet; the loadedmetadata handler will seek.
  }
}

function effectiveOverlap(clip: PlayableClip): number {
  const durationMs = Math.max(0, clip.endTime - clip.startTime) * 1000;
  return crossfadeEnabled ? Math.min(crossfadeOverlapMs, durationMs * 0.4) : 0;
}

function clearClipEndCallback(): void {
  onClipEndCallback = null;
}

function fireClipEnd(): void {
  if (chainEndFired) return;
  chainEndFired = true;
  const callback = onClipEndCallback;
  onClipEndCallback = null;
  // Never treat a clip that never reached `playing` as a successful end.
  if (!playbackStarted) return;
  callback?.();
}

function handoffChainToClip(clip: PlayableClip, handleEnd: ClipEndHandler | null): void {
  activeClip = clip;
  chainEndFired = false;
  onClipEndCallback = handleEnd;
}

function resetProgressForClip(clip: PlayableClip): void {
  const duration = Math.max(0.1, clip.endTime - clip.startTime);
  currentState.currentTime = clip.startTime;
  currentState.duration = duration;
  currentState.progress = 0;
  currentState.remainingTime = duration;
}

function failActivePlayback(message: string): void {
  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();
  clearClipEndCallback();
  playbackStarted = false;
  currentState.state = "error";
  currentState.errorMessage = message;
  notify();
}

function finishClip(): void {
  if (outroFadeInProgress || crossfadeInProgress) return;
  stopPoll();
  cancelVolumeRamp();
  const active = getActiveSlot();
  active?.audio.pause();
  currentState.state = "ended";
  currentState.progress = 1;
  currentState.remainingTime = 0;
  activeClip = null;
  if (active) active.clip = null;
  playbackFadeIn = false;
  playbackFadeOut = false;
  notify();
  fireClipEnd();
}

function startCrossfade(incomingClip: PlayableClip): void {
  if (crossfadeInProgress || !slots) return;
  const outgoing = getActiveSlot();
  const incoming = getStandbySlot();
  const overlap = effectiveOverlap(incomingClip);
  if (!outgoing || !incoming || overlap <= 0) return;

  crossfadeInProgress = true;
  cancelVolumeRamp();
  incoming.clip = incomingClip;
  loadAudio(incoming, incomingClip);
  setAudioVolume(incoming, 0);
  void incoming.audio.play().catch(() => {
    crossfadeInProgress = false;
    incoming.preloadedClip = null;
    incoming.clip = null;
    // Keep the outgoing clip running; the normal end path will start the next
    // preview without overlap instead of failing the whole host session.
    currentState.errorMessage = null;
    notify();
  });

  const started = performance.now();
  const target = getTargetVolume();
  const tick = (now: number) => {
    const progress = Math.min(1, (now - started) / overlap);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    setAudioVolume(outgoing, target * (1 - eased));
    setAudioVolume(incoming, target * eased);
    if (progress < 1) crossfadeRafId = requestAnimationFrame(tick);
    else {
      crossfadeRafId = null;
      crossfadeInProgress = false;
      outgoing.audio.pause();
      outgoing.clip = null;
      incoming.preloadedClip = null;
      activeSlotIndex = activeSlotIndex === 0 ? 1 : 0;
      const chainCb = onClipEndCallback;
      // Switch active clip before progress/notify so Host never sees stale
      // remainingTime ≈ 0 from the outgoing track on the incoming currentClip.
      activeClip = incomingClip;
      currentState.currentClip = incomingClip;
      currentState.state = "playing";
      currentState.errorMessage = null;
      currentState.activePlayerElementId = incoming.wrapperId;
      currentState.visiblePlayerElementId = incoming.wrapperId;
      updateProgress();
      notify();
      fireClipEnd();
      handoffChainToClip(incomingClip, chainCb);
      playbackStarted = true;
      startPoll();
    }
  };
  crossfadeRafId = requestAnimationFrame(tick);
}

function startPoll(): void {
  stopPoll();
  pollTimer = window.setInterval(() => {
    if (!activeClip || !getActiveSlot()) return stopPoll();
    const remaining = updateProgress();
    const standby = getStandbySlot();
    if (standby?.preloadedClip && remaining * 1000 <= effectiveOverlap(standby.preloadedClip) + 50) {
      startCrossfade(standby.preloadedClip);
      return;
    }
    if (playbackFadeOut && !outroFadeInProgress && remaining * 1000 <= outroFadeMs) {
      const active = getActiveSlot();
      if (active) {
        outroFadeInProgress = true;
        fadeSlot(active, getTargetVolume(), 0, Math.max(100, remaining * 1000), finishClip);
        return;
      }
    }
    if (remaining <= 0.15) finishClip();
    else notify();
  }, 100);
}

function handleAudioEvent(slotIndex: number, event: string): void {
  if (slotIndex !== activeSlotIndex) return;
  if (event === "playing") {
    playbackStarted = true;
    currentState.state = "playing";
    notify();
  } else if (event === "waiting" || event === "loadstart") {
    currentState.state = "buffering";
    notify();
  } else if (event === "error") {
    failActivePlayback("The Deezer preview could not be loaded in this browser.");
  }
}

function createAudioSlot(container: HTMLElement, wrapperId: string, slotIndex: number): AudioSlot {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.className = "deezer-audio-element";
  audio.setAttribute("aria-hidden", "true");
  for (const event of ["playing", "waiting", "loadstart", "error", "pause"]) {
    audio.addEventListener(event, () => handleAudioEvent(slotIndex, event));
  }
  audio.addEventListener("loadedmetadata", () => {
    const clip = slots?.[slotIndex]?.clip || slots?.[slotIndex]?.preloadedClip;
    if (clip) {
      try { audio.currentTime = clip.startTime; } catch { /* wait for metadata */ }
    }
  });
  container.appendChild(audio);
  return { wrapperId, container, audio, clip: null, preloadedClip: null };
}

const DEEZER_ENGINE_HOST_ID = "deezer-audio-engine-host";

/**
 * Mount audio slots synchronously so play() can run inside a user gesture.
 * React's DeezerAudioEngine also calls this; both share one document.body host.
 */
export function ensureDeezerPlayersMounted(): void {
  if (slots && slots[0].container.isConnected && slots[1].container.isConnected) {
    currentState.isReady = true;
    return;
  }

  let host = document.getElementById(DEEZER_ENGINE_HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = DEEZER_ENGINE_HOST_ID;
    host.className = "deezer-audio-engine-fallback print:hidden";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }

  let wrapA = host.querySelector<HTMLElement>(`#${DEEZER_SLOT_WRAP_A}`);
  let wrapB = host.querySelector<HTMLElement>(`#${DEEZER_SLOT_WRAP_B}`);
  if (!wrapA || !wrapB) {
    host.replaceChildren();
    wrapA = document.createElement("div");
    wrapA.id = DEEZER_SLOT_WRAP_A;
    wrapB = document.createElement("div");
    wrapB.id = DEEZER_SLOT_WRAP_B;
    host.append(wrapA, wrapB);
  }

  mountDeezerPlayers(wrapA, wrapB);
}

export function mountDeezerPlayers(wrapA: HTMLElement, wrapB: HTMLElement): void {
  if (slots && slots[0].container.isConnected && slots[1].container.isConnected) {
    currentState.isReady = true;
    flushPendingPlay();
    return;
  }
  teardownDeezerPlayers();
  slots = [
    createAudioSlot(wrapA, DEEZER_SLOT_WRAP_A, 0),
    createAudioSlot(wrapB, DEEZER_SLOT_WRAP_B, 1),
  ];
  activeSlotIndex = 0;
  currentState.isReady = true;
  currentState.activePlayerElementId = DEEZER_SLOT_WRAP_A;
  currentState.visiblePlayerElementId = DEEZER_SLOT_WRAP_A;
  notify();
  flushPendingPlay();
}

function flushPendingPlay(): void {
  if (!pendingPlay || !slots) return;
  const request = pendingPlay;
  pendingPlay = null;
  playClip(request.clip, request.handleEnd, request.options);
}

export function teardownDeezerPlayers(): void {
  stopPlayback();
  stopPoll();
  cancelCrossfade();
  if (slots) {
    for (const slot of slots) slot.audio.remove();
  }
  slots = null;
  currentState.isReady = false;
}

export function subscribeToPlayerState(listener: StateListener): () => void {
  listeners.add(listener);
  listener({ ...currentState });
  return () => listeners.delete(listener);
}

export function getPlayerState(): PlayerPlaybackState { return { ...currentState }; }

export function setCrossfadeConfig(overlapMs: number, enabled: boolean): void {
  crossfadeOverlapMs = Math.max(0, Math.min(3000, overlapMs));
  crossfadeEnabled = enabled;
}

export function setPlaybackFadeConfig(introMs: number, outroMs: number): void {
  introFadeMs = Math.max(0, Math.min(5000, introMs));
  outroFadeMs = Math.max(0, Math.min(5000, outroMs));
}

export function preloadClip(clip: PlayableClip): void {
  const standby = getStandbySlot();
  if (!standby || !clip.previewUrl) return;
  standby.preloadedClip = clip;
  try {
    loadAudio(standby, clip);
    setAudioVolume(standby, 0);
  } catch {
    standby.preloadedClip = null;
  }
}

export function clearPreload(): void {
  const standby = getStandbySlot();
  if (standby) standby.preloadedClip = null;
}

export function continueClipPlayback(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): boolean {
  if (!activeClip || activeClip.trackId !== clip.trackId || currentState.currentClip?.sourceId !== clip.sourceId) return false;
  if (!["playing", "buffering", "paused"].includes(currentState.state)) return false;
  handoffChainToClip(clip, handleEnd ?? null);
  applyOptions(options);
  const active = getActiveSlot();
  if (currentState.state === "paused") void active?.audio.play();
  startPoll();
  notify();
  return true;
}

export function activatePreloadedClip(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): boolean {
  if (continueClipPlayback(clip, handleEnd, options)) return true;
  const standby = getStandbySlot();
  if (!standby?.preloadedClip || standby.preloadedClip.sourceId !== clip.sourceId) return false;
  const outgoing = getActiveSlot();
  outgoing?.audio.pause();
  activeSlotIndex = activeSlotIndex === 0 ? 1 : 0;
  standby.preloadedClip = null;
  standby.clip = clip;
  playbackStarted = false;
  handoffChainToClip(clip, handleEnd ?? null);
  applyOptions(options);
  currentState.currentClip = clip;
  currentState.errorMessage = null;
  currentState.activePlayerElementId = standby.wrapperId;
  currentState.visiblePlayerElementId = standby.wrapperId;
  resetProgressForClip(clip);
  setBothVolumes();
  void standby.audio.play().then(() => {
    playbackStarted = true;
    currentState.state = "playing";
    startPoll();
    notify();
  }).catch(() => {
    // A preload can fail after the initial request. Retry through the normal
    // path, which provides non-crossfaded playback as a graceful fallback.
    standby.preloadedClip = null;
    playClip(clip, handleEnd, options);
  });
  return true;
}

export function playClip(clip: PlayableClip, handleEnd?: ClipEndHandler, options?: ClipPlaybackOptions): void {
  if (clip.provider !== "deezer") return;
  ensureDeezerPlayersMounted();
  if (!slots || !currentState.isReady) {
    pendingPlay = { clip, handleEnd, options };
    currentState.currentClip = clip;
    currentState.state = "buffering";
    currentState.errorMessage = null;
    currentState.remainingTime = Math.max(0, clip.endTime - clip.startTime);
    notify();
    return;
  }

  cancelCrossfade();
  cancelVolumeRamp();
  clearPreload();
  const active = getActiveSlot();
  const standby = getStandbySlot();
  active?.audio.pause();
  standby?.audio.pause();
  if (!active) return;
  activeSlotIndex = activeSlotIndex === 0 ? 0 : 1;
  activeClip = clip;
  chainEndFired = false;
  playbackStarted = false;
  onClipEndCallback = handleEnd ?? null;
  applyOptions(options);
  active.clip = clip;
  currentState.currentClip = clip;
  currentState.state = "buffering";
  currentState.errorMessage = null;
  resetProgressForClip(clip);
  currentState.activePlayerElementId = active.wrapperId;
  currentState.visiblePlayerElementId = active.wrapperId;
  if (playbackFadeIn) setAudioVolume(active, 0);
  else setBothVolumes();
  try {
    loadAudio(active, clip);
    void active.audio.play().then(() => {
      playbackStarted = true;
      currentState.state = "playing";
      if (playbackFadeIn && introFadeMs > 0) fadeSlot(active, 0, getTargetVolume(), introFadeMs);
      startPoll();
      notify();
    }).catch(() => {
      failActivePlayback("The browser blocked Deezer audio playback.");
    });
  } catch (err) {
    failActivePlayback(err instanceof Error ? err.message : "Deezer preview unavailable.");
  }
}

export function pausePlayback(): void {
  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();
  slots?.forEach((slot) => slot.audio.pause());
  currentState.state = "paused";
  notify();
}

export function resumePlayback(): void {
  const active = getActiveSlot();
  if (!active || !currentState.currentClip) return;
  if (active.audio.currentTime >= currentState.currentClip.endTime - 0.2) {
    playClip(currentState.currentClip, onClipEndCallback ?? undefined);
    return;
  }
  void active.audio.play().then(() => {
    playbackStarted = true;
    currentState.state = "playing";
    startPoll();
    notify();
  }).catch(() => {
    failActivePlayback("The browser blocked Deezer audio playback.");
  });
}

export function stopPlayback(): void {
  stopPoll();
  cancelCrossfade();
  cancelVolumeRamp();
  slots?.forEach((slot) => {
    slot.audio.pause();
    slot.audio.currentTime = 0;
    slot.clip = null;
    slot.preloadedClip = null;
  });
  activeClip = null;
  onClipEndCallback = null;
  chainEndFired = false;
  playbackStarted = false;
  pendingPlay = null;
  currentState.currentClip = null;
  currentState.state = "unstarted";
  currentState.currentTime = 0;
  currentState.progress = 0;
  currentState.remainingTime = 0;
  notify();
}

export function setVolume(volume: number): void {
  currentState.volume = Math.max(0, Math.min(100, volume));
  if (currentState.volume > 0) currentState.isMuted = false;
  setBothVolumes();
  notify();
}

export function toggleMute(): void {
  currentState.isMuted = !currentState.isMuted;
  setBothVolumes();
  notify();
}
