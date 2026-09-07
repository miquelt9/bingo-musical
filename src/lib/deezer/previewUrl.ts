import { Track, TrackMedia } from "../../types/deck";
import { resolveDeezerTrack } from "./api";

const PREVIEW_EXPIRY_SKEW_SECONDS = 60;

export function deezerPreviewExpiryUnix(previewUrl: string): number | null {
  try {
    const url = new URL(previewUrl);
    const hdnea = url.searchParams.get("hdnea");
    const fromHdnea = hdnea?.match(/(?:^|~)exp=(\d+)/)?.[1];
    const expRaw = fromHdnea ?? url.searchParams.get("exp");
    if (!expRaw) return null;
    const value = Number.parseInt(expRaw, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** True when the signed CDN URL is still valid for playback. */
export function isDeezerPreviewUrlFresh(
  previewUrl: string | null | undefined,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!previewUrl?.trim()) return false;
  const exp = deezerPreviewExpiryUnix(previewUrl);
  // Missing expiry (legacy unsigned URLs) — force a refresh.
  if (exp === null) return false;
  return exp > nowSec + PREVIEW_EXPIRY_SKEW_SECONDS;
}

export type DeezerMedia = Extract<TrackMedia, { provider: "deezer" }>;

export interface FreshDeezerPreview {
  previewUrl: string;
  previewDurationMs: number;
  media: DeezerMedia;
  refreshed: boolean;
}

/**
 * Return a playable Deezer preview URL, refreshing via the Worker when the
 * stored signed URL is missing or near expiry.
 */
export async function ensureFreshDeezerPreview(
  media: DeezerMedia,
  signal?: AbortSignal
): Promise<FreshDeezerPreview> {
  if (media.previewUrl && isDeezerPreviewUrlFresh(media.previewUrl)) {
    return {
      previewUrl: media.previewUrl,
      previewDurationMs: media.previewDurationMs ?? 30000,
      media,
      refreshed: false,
    };
  }

  const hit = await resolveDeezerTrack(media.id, signal);
  if (!hit.previewUrl) {
    throw new Error("This Deezer track has no playable preview.");
  }

  if (!isDeezerPreviewUrlFresh(hit.previewUrl)) {
    throw new Error("Deezer preview URL is still expired after refresh.");
  }

  const nextMedia: DeezerMedia = {
    ...media,
    previewUrl: hit.previewUrl,
    previewDurationMs: hit.previewDurationMs || 30000,
    providerUrl: hit.providerUrl || media.providerUrl,
  };

  return {
    previewUrl: hit.previewUrl,
    previewDurationMs: nextMedia.previewDurationMs ?? 30000,
    media: nextMedia,
    refreshed: true,
  };
}

export function withFreshDeezerMedia(track: Track, media: DeezerMedia): Track {
  return {
    ...track,
    media,
    matchStatus: media.previewUrl ? (track.matchStatus === "manual" ? "manual" : "matched") : "failed",
  };
}

export function trackNeedsDeezerPreviewRefresh(track: Track): boolean {
  if (track.media?.provider !== "deezer") return false;
  return !isDeezerPreviewUrlFresh(track.media.previewUrl);
}
