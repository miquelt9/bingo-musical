import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Track } from "../types/deck";
import { loadYoutubeApi } from "../lib/youtube/player";
import { stopPlayback as stopSharedPlayback } from "../lib/player/player";
import {
  ensureFreshDeezerPreview,
  withFreshDeezerMedia,
} from "../lib/deezer/previewUrl";

export const MIN_CLIP_SECONDS = 5;

interface UseClipTimestampEditorOptions {
  track: Track;
  isOpen: boolean;
  onTrackMediaUpdated?: (updatedTrack: Track) => void;
}

export function useClipTimestampEditor({
  track,
  isOpen,
  onTrackMediaUpdated,
}: UseClipTimestampEditorOptions) {
  const reactId = useId();
  const elementId = `yt-clip-editor-${track.id}-${reactId.replace(/:/g, "")}`;

  const playerRef = useRef<YT.Player | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const trackRef = useRef(track);
  trackRef.current = track;

  const [editorTrack, setEditorTrack] = useState(track);
  const [draftStart, setDraftStart] = useState(track.startTime);
  const [draftEnd, setDraftEnd] = useState(track.endTime);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isTransportPlaying, setIsTransportPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const isDeezer = editorTrack.media?.provider === "deezer";
  const deezerMedia = editorTrack.media?.provider === "deezer" ? editorTrack.media : null;
  const sourceId = editorTrack.media?.id;
  const clipDuration = Math.max(0, draftEnd - draftStart);
  const maxDuration = isDeezer ? (videoDuration || (deezerMedia?.previewDurationMs ?? 30000) / 1000) : 0;
  const isValid = draftStart >= 0
    && draftEnd >= draftStart + MIN_CLIP_SECONDS
    && (!isDeezer || (draftStart <= maxDuration && draftEnd <= maxDuration));

  const stopPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setIsPreviewing(false);
    try {
      playerRef.current?.pauseVideo();
      audioRef.current?.pause();
    } catch {
      // ignore
    }
    setIsTransportPlaying(false);
  }, []);

  const destroyPlayer = useCallback(() => {
    stopPreview();
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      playerRef.current?.destroy();
    } catch {
      // ignore
    }
    playerRef.current = null;
    if (audioRef.current) {
      audioRef.current.remove();
      audioRef.current = null;
    }
    setIsPlayerReady(false);
    setIsLoadingPlayer(false);
    setIsTransportPlaying(false);
  }, [stopPreview]);

  useEffect(() => {
    if (!isOpen) return;
    // Stop list/host preview so it does not overlap the editor audio/video.
    stopSharedPlayback();
    setEditorTrack(track);
    setDraftStart(track.startTime);
    setDraftEnd(track.endTime);
    setCurrentTime(0);
    setVideoDuration(0);
    setPlayerError(null);
    setIsPreviewing(false);
    setIsTransportPlaying(false);
  }, [isOpen, track.startTime, track.endTime, track.id, track]);

  useEffect(() => {
    if (!isOpen || !sourceId) {
      destroyPlayer();
      return;
    }

    let cancelled = false;
    setIsLoadingPlayer(true);
    setPlayerError(null);
    setIsPlayerReady(false);

    const initPlayer = async () => {
      try {
        if (isDeezer) {
          if (!deezerMedia) throw new Error("This Deezer track has no preview to edit.");
          let media = deezerMedia;
          try {
            const fresh = await ensureFreshDeezerPreview(deezerMedia);
            media = fresh.media;
            if (fresh.refreshed && !cancelled) {
              const updated = withFreshDeezerMedia(trackRef.current, fresh.media);
              setEditorTrack(updated);
              onTrackMediaUpdated?.(updated);
            }
          } catch {
            if (!cancelled) {
              setPlayerError("Deezer preview unavailable. Try Change source or try again later.");
              setIsLoadingPlayer(false);
            }
            return;
          }
          if (cancelled) return;
          if (!media.previewUrl) {
            setPlayerError("This Deezer track has no playable preview.");
            setIsLoadingPlayer(false);
            return;
          }

          const container = document.getElementById(elementId);
          if (!container) throw new Error("Audio editor container is unavailable.");
          const audio = document.createElement("audio");
          audio.className = "w-full h-full opacity-0 absolute inset-0 pointer-events-none";
          audio.controls = false;
          audio.preload = "metadata";
          audio.src = media.previewUrl;
          audio.onloadedmetadata = () => {
            if (cancelled) return;
            const knownDuration = (media.previewDurationMs ?? 30000) / 1000;
            setVideoDuration(Math.min(audio.duration || knownDuration, knownDuration));
            audio.currentTime = Math.min(trackRef.current.startTime, knownDuration);
            setCurrentTime(audio.currentTime);
            setIsPlayerReady(true);
            setIsLoadingPlayer(false);
          };
          audio.onplay = () => {
            if (!cancelled) setIsTransportPlaying(true);
          };
          audio.onpause = () => {
            if (!cancelled) setIsTransportPlaying(false);
          };
          audio.onerror = () => {
            if (cancelled) return;
            setPlayerError("Failed to load the Deezer preview. The preview URL may have expired.");
            setIsLoadingPlayer(false);
            setIsPlayerReady(false);
          };
          container.replaceChildren(audio);
          audioRef.current = audio;
          audio.load();
          return;
        }
        await loadYoutubeApi();
        if (cancelled) return;

        const player = new window.YT!.Player(elementId, {
          width: "100%",
          height: "100%",
          videoId: sourceId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: trackRef.current.startTime,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setIsPlayerReady(true);
              setIsLoadingPlayer(false);
              const duration = event.target.getDuration?.() ?? 0;
              if (duration > 0) {
                setVideoDuration(duration);
              }
              const time = event.target.getCurrentTime?.() ?? 0;
              setCurrentTime(time);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const playing = event.data === window.YT?.PlayerState.PLAYING;
              const paused = event.data === window.YT?.PlayerState.PAUSED
                || event.data === window.YT?.PlayerState.ENDED
                || event.data === window.YT?.PlayerState.CUED;
              if (playing) setIsTransportPlaying(true);
              else if (paused) setIsTransportPlaying(false);
            },
            onError: () => {
              if (cancelled) return;
              setPlayerError("Failed to load video. The video may be unavailable or restricted.");
              setIsLoadingPlayer(false);
            },
          },
        });

        if (!cancelled) {
          playerRef.current = player;
        }
      } catch {
        if (!cancelled) {
          setPlayerError(isDeezer ? "Failed to load the Deezer preview." : "Failed to initialize YouTube player.");
          setIsLoadingPlayer(false);
        }
      }
    };

    void initPlayer();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [isOpen, sourceId, isDeezer, elementId, destroyPlayer, onTrackMediaUpdated, deezerMedia?.id]);

  useEffect(() => {
    if (!isOpen || !isPlayerReady) return;

    pollTimerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      const audio = audioRef.current;
      if (isDeezer && audio) {
        setCurrentTime(audio.currentTime || 0);
        return;
      }
      if (!player || typeof player.getCurrentTime !== "function") return;
      const time = player.getCurrentTime() ?? 0;
      setCurrentTime(time);
      const duration = player.getDuration?.() ?? 0;
      if (duration > 0) {
        setVideoDuration(duration);
      }
    }, 250);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, isPlayerReady, isDeezer]);

  const handleSetStart = useCallback(() => {
    const player = playerRef.current;
    const current = isDeezer ? audioRef.current?.currentTime : player?.getCurrentTime?.();
    if (current === undefined) return;
    const nextStart = Math.max(0, Math.floor(current ?? 0));
    const maxStart = videoDuration > 0 ? Math.max(0, videoDuration - MIN_CLIP_SECONDS) : draftEnd - MIN_CLIP_SECONDS;
    const clampedStart = videoDuration > 0 ? Math.min(nextStart, maxStart) : nextStart;
    setDraftStart(clampedStart);
    if (draftEnd < clampedStart + MIN_CLIP_SECONDS) {
      const nextEnd = videoDuration > 0
        ? Math.min(videoDuration, clampedStart + MIN_CLIP_SECONDS)
        : clampedStart + MIN_CLIP_SECONDS;
      setDraftEnd(nextEnd);
    }
  }, [videoDuration, draftEnd, isDeezer]);

  const handleSetEnd = useCallback(() => {
    const player = playerRef.current;
    const current = isDeezer ? audioRef.current?.currentTime : player?.getCurrentTime?.();
    if (current === undefined) return;
    let nextEnd = Math.max(draftStart + MIN_CLIP_SECONDS, Math.floor(current ?? 0));
    if (videoDuration > 0) {
      nextEnd = Math.min(nextEnd, videoDuration);
    }
    setDraftEnd(nextEnd);
  }, [draftStart, videoDuration, isDeezer]);

  const handleSeek = useCallback((seconds: number) => {
    const max = videoDuration > 0 ? videoDuration : seconds;
    const clamped = Math.max(0, Math.min(seconds, max));
    if (isDeezer && audioRef.current) audioRef.current.currentTime = clamped;
    else playerRef.current?.seekTo(clamped, true);
    setCurrentTime(clamped);
  }, [videoDuration, isDeezer]);

  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    const audio = audioRef.current;
    if (!player && !audio) return;

    if (isPreviewing) {
      stopPreview();
    }

    if (isDeezer && audio) {
      if (audio.paused) {
        stopSharedPlayback();
        void audio.play().catch(() => {
          setPlayerError("The browser blocked preview playback.");
        });
      } else {
        audio.pause();
      }
      return;
    }

    if (!player) return;
    const state = player.getPlayerState?.();
    if (state === window.YT?.PlayerState.PLAYING) {
      player.pauseVideo();
      setIsTransportPlaying(false);
    } else {
      stopSharedPlayback();
      player.playVideo();
      setIsTransportPlaying(true);
    }
  }, [isDeezer, isPreviewing, stopPreview]);

  const handlePreview = useCallback(() => {
    const player = playerRef.current;
    const audio = audioRef.current;
    if ((!player && !audio) || !isValid) return;

    if (isPreviewing) {
      stopPreview();
      return;
    }

    stopSharedPlayback();
    setIsPreviewing(true);
    setIsTransportPlaying(true);
    if (audio) {
      audio.currentTime = draftStart;
      void audio.play().catch(() => {
        setPlayerError("The browser blocked preview playback.");
        stopPreview();
      });
    } else {
      player?.seekTo(draftStart, true);
      player?.playVideo();
    }

    const watchEnd = () => {
      const p = playerRef.current;
      const a = audioRef.current;
      if (a) {
        if (a.currentTime >= draftEnd - 0.2) {
          a.pause();
          stopPreview();
          return;
        }
        previewRafRef.current = requestAnimationFrame(watchEnd);
        return;
      }
      if (!p || typeof p.getCurrentTime !== "function") {
        stopPreview();
        return;
      }
      const time = p.getCurrentTime() ?? 0;
      if (time >= draftEnd - 0.2) {
        p.pauseVideo();
        stopPreview();
        return;
      }
      previewRafRef.current = requestAnimationFrame(watchEnd);
    };

    previewRafRef.current = requestAnimationFrame(watchEnd);
  }, [draftStart, draftEnd, isValid, isPreviewing, stopPreview]);

  const buildUpdatedTrack = useCallback((): Track | null => {
    if (!isValid) return null;
    return {
      ...editorTrack,
      startTime: draftStart,
      endTime: draftEnd,
    };
  }, [editorTrack, draftStart, draftEnd, isValid]);

  return {
    elementId,
    hasVideo: Boolean(sourceId && (!isDeezer || Boolean(deezerMedia))),
    draftStart,
    draftEnd,
    currentTime,
    videoDuration,
    clipDuration,
    isValid,
    isPlayerReady,
    isLoadingPlayer,
    isPreviewing,
    isTransportPlaying,
    playerError,
    handleSetStart,
    handleSetEnd,
    handleSeek,
    handlePlayPause,
    handlePreview,
    buildUpdatedTrack,
  };
}
