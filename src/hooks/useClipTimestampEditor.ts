import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Track } from "../types/deck";
import { loadYoutubeApi } from "../lib/youtube/player";

export const MIN_CLIP_SECONDS = 5;

interface UseClipTimestampEditorOptions {
  track: Track;
  isOpen: boolean;
}

export function useClipTimestampEditor({ track, isOpen }: UseClipTimestampEditorOptions) {
  const reactId = useId();
  const elementId = `yt-clip-editor-${track.id}-${reactId.replace(/:/g, "")}`;

  const playerRef = useRef<YT.Player | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const [draftStart, setDraftStart] = useState(track.startTime);
  const [draftEnd, setDraftEnd] = useState(track.endTime);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const hasVideo = Boolean(track.youtubeVideoId);
  const clipDuration = Math.max(0, draftEnd - draftStart);
  const isValid = draftStart >= 0 && draftEnd >= draftStart + MIN_CLIP_SECONDS;

  const stopPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setIsPreviewing(false);
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
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
    setIsPlayerReady(false);
    setIsLoadingPlayer(false);
  }, [stopPreview]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftStart(track.startTime);
    setDraftEnd(track.endTime);
    setCurrentTime(0);
    setVideoDuration(0);
    setPlayerError(null);
    setIsPreviewing(false);
  }, [isOpen, track.startTime, track.endTime, track.id]);

  useEffect(() => {
    if (!isOpen || !hasVideo || !track.youtubeVideoId) {
      destroyPlayer();
      return;
    }

    let cancelled = false;
    setIsLoadingPlayer(true);
    setPlayerError(null);

    const initPlayer = async () => {
      try {
        await loadYoutubeApi();
        if (cancelled) return;

        const player = new window.YT!.Player(elementId, {
          width: "100%",
          height: "100%",
          videoId: track.youtubeVideoId!,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: track.startTime,
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
          setPlayerError("Failed to initialize YouTube player.");
          setIsLoadingPlayer(false);
        }
      }
    };

    void initPlayer();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [isOpen, hasVideo, track.youtubeVideoId, track.startTime, elementId, destroyPlayer]);

  useEffect(() => {
    if (!isOpen || !isPlayerReady) return;

    pollTimerRef.current = window.setInterval(() => {
      const player = playerRef.current;
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
  }, [isOpen, isPlayerReady]);

  const handleSetStart = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== "function") return;
    const nextStart = Math.max(0, Math.floor(player.getCurrentTime() ?? 0));
    const maxStart = videoDuration > 0 ? Math.max(0, videoDuration - MIN_CLIP_SECONDS) : draftEnd - MIN_CLIP_SECONDS;
    const clampedStart = videoDuration > 0 ? Math.min(nextStart, maxStart) : nextStart;
    setDraftStart(clampedStart);
    if (draftEnd < clampedStart + MIN_CLIP_SECONDS) {
      const nextEnd = videoDuration > 0
        ? Math.min(videoDuration, clampedStart + MIN_CLIP_SECONDS)
        : clampedStart + MIN_CLIP_SECONDS;
      setDraftEnd(nextEnd);
    }
  }, [videoDuration, draftEnd]);

  const handleSetEnd = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== "function") return;
    let nextEnd = Math.max(draftStart + MIN_CLIP_SECONDS, Math.floor(player.getCurrentTime() ?? 0));
    if (videoDuration > 0) {
      nextEnd = Math.min(nextEnd, videoDuration);
    }
    setDraftEnd(nextEnd);
  }, [draftStart, videoDuration]);

  const handleSeek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player || typeof player.seekTo !== "function") return;
    const max = videoDuration > 0 ? videoDuration : seconds;
    const clamped = Math.max(0, Math.min(seconds, max));
    player.seekTo(clamped, true);
    setCurrentTime(clamped);
  }, [videoDuration]);

  const handlePreview = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isValid) return;

    if (isPreviewing) {
      stopPreview();
      return;
    }

    setIsPreviewing(true);
    player.seekTo(draftStart, true);
    player.playVideo();

    const watchEnd = () => {
      const p = playerRef.current;
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
      ...track,
      startTime: draftStart,
      endTime: draftEnd,
    };
  }, [track, draftStart, draftEnd, isValid]);

  return {
    elementId,
    hasVideo,
    draftStart,
    draftEnd,
    currentTime,
    videoDuration,
    clipDuration,
    isValid,
    isPlayerReady,
    isLoadingPlayer,
    isPreviewing,
    playerError,
    handleSetStart,
    handleSetEnd,
    handleSeek,
    handlePreview,
    buildUpdatedTrack,
  };
}
