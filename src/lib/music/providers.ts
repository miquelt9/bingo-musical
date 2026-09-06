import { MusicProvider, Track } from "../../types/deck";
import { isDeezerTrackPlayable } from "../deezer/api";
import { getCachedEmbedStatus, isVideoEmbedBlocked } from "../youtube/validator";

export function getTrackProvider(track: Track, fallback: MusicProvider = "youtube"): MusicProvider {
  return track.media?.provider ?? fallback;
}

export function getTrackSourceId(track: Track): string | null {
  return track.media?.id ?? null;
}

export function isTrackPlayable(track: Track): boolean {
  if (track.matchStatus === "failed" || !track.media) return false;
  if (track.media.provider === "deezer") return isDeezerTrackPlayable(track);
  const cached = getCachedEmbedStatus(track.media.id);
  return !isVideoEmbedBlocked(track.media.id) && (cached === null || cached.embeddable);
}

export function isTrackNeedsVerification(track: Track): boolean {
  return track.media?.provider === "youtube" && track.matchStatus !== "failed" && getCachedEmbedStatus(track.media.id) === null;
}

export function getProviderLabel(provider: MusicProvider): string {
  return provider === "deezer" ? "Deezer" : "YouTube";
}
