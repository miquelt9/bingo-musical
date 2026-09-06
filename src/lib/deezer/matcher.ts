import { Track } from "../../types/deck";
import { BatchMatchProgress } from "../youtube/matcher";
import { DeezerTrackHit, deezerHitToTrack, searchDeezerTracks, searchDeezerTracksBatch } from "./api";

export function normalizeMusicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function primaryArtist(value: string): string {
  return normalizeMusicText(value.split(/\s+(?:feat\.?|ft\.?|featuring|&|and)\s+/i)[0]);
}

export function deezerMatchConfidence(track: Track, candidate: DeezerTrackHit): "high" | "ambiguous" | "none" {
  const titleMatches = normalizeMusicText(track.title) === normalizeMusicText(candidate.title);
  const artistMatches = primaryArtist(track.artist) === primaryArtist(candidate.artist);
  if (titleMatches && artistMatches) return "high";
  if (titleMatches || artistMatches) return "ambiguous";
  return "none";
}

export function chooseDeezerMatch(track: Track, candidates: DeezerTrackHit[]): DeezerTrackHit | null {
  const exact = candidates.filter((candidate) => deezerMatchConfidence(track, candidate) === "high" && candidate.previewUrl);
  if (exact.length === 0) return null;

  // Deezer often returns several album editions of the same mainstream song.
  // Prefer the edition closest to the source duration instead of treating that
  // normal catalog duplication as an unresolved ambiguity.
  return [...exact].sort((a, b) =>
    Math.abs(a.durationMs - track.durationMs) - Math.abs(b.durationMs - track.durationMs)
  )[0];
}

export async function matchTrackToDeezer(track: Track, signal?: AbortSignal): Promise<Track> {
  const candidates = await searchDeezerTracks(`${track.artist} ${track.title}`, 8, signal);
  const match = chooseDeezerMatch(track, candidates);
  if (!match) return { ...track, media: null, matchStatus: "pending" };
  const resolved = deezerHitToTrack(match);
  return {
    ...track,
    album: resolved.album,
    albumArtUrl: resolved.albumArtUrl,
    durationMs: resolved.durationMs,
    media: resolved.media,
    startTime: resolved.startTime,
    endTime: resolved.endTime,
    matchStatus: "matched",
  };
}

export async function batchMatchDeezerTracks(
  tracks: Track[],
  concurrency = 2,
  onProgress?: (progress: BatchMatchProgress, track: Track) => void,
  shouldCancel?: () => boolean
): Promise<Track[]> {
  const targets = tracks.filter((track) => !track.media || track.media.provider !== "deezer" || track.matchStatus !== "matched" || !track.media.previewUrl);
  const results = new Map(tracks.map((track) => [track.id, track]));
  let completed = 0;
  let matched = 0;
  let failed = 0;
  let cursor = 0;

  let batchCandidates: DeezerTrackHit[][] | null = null;
  try {
    batchCandidates = await searchDeezerTracksBatch(targets);
  } catch {
    // Keep the per-track fallback for older Workers and ordinary search usage.
  }

  const worker = async () => {
    while (cursor < targets.length) {
      if (shouldCancel?.()) return;
      const targetIndex = cursor++;
      const track = targets[targetIndex];
      try {
        const candidates = batchCandidates
          ? batchCandidates[targetIndex] ?? []
          : await searchDeezerTracks(`${track.artist} ${track.title}`, 8);
        const match = chooseDeezerMatch(track, candidates);
        const updated = match
          ? (() => {
              const resolved = deezerHitToTrack(match);
              return {
                ...track,
                album: resolved.album,
                albumArtUrl: resolved.albumArtUrl,
                durationMs: resolved.durationMs,
                media: resolved.media,
                startTime: resolved.startTime,
                endTime: resolved.endTime,
                matchStatus: "matched" as const,
              };
            })()
          : { ...track, media: null, matchStatus: "pending" as const };
        results.set(track.id, updated);
        if (updated.media?.provider === "deezer" && updated.media.previewUrl) matched += 1;
        else failed += 1;
        completed += 1;
        onProgress?.({ total: targets.length, completed, matched, failed }, updated);
      } catch {
        const updated = { ...track, media: null, matchStatus: "pending" as const };
        results.set(track.id, updated);
        failed += 1;
        completed += 1;
        onProgress?.({ total: targets.length, completed, matched, failed }, updated);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, targets.length || 1)) }, worker));
  return tracks.map((track) => results.get(track.id) ?? track);
}
