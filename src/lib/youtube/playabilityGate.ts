import { Track } from "../../types/deck";
import {
  getCachedEmbedStatus,
  isTrackUnplayable,
  validateTracksEmbeddability,
  checkVideoEmbeddable,
  BatchValidationProgress,
  EmbedValidationResult,
} from "./validator";

export interface InvalidTrackEntry {
  track: Track;
  reason: string;
  validation?: EmbedValidationResult;
}

export interface DeckPlayabilityResult {
  playable: boolean;
  invalidTracks: InvalidTrackEntry[];
  validatedAt: number;
}

/** True when embed status has not been cached yet (needs network check). */
export function isTrackNeedsVerification(track: Track): boolean {
  if (!track.youtubeVideoId) return false;
  if (track.matchStatus === "failed") return false;
  return getCachedEmbedStatus(track.youtubeVideoId) === null;
}

/** False if any track is unplayable or still needs verification. */
export function canStartGame(tracks: Track[]): boolean {
  if (tracks.length === 0) return false;
  return tracks.every((t) => !isTrackUnplayable(t) && !isTrackNeedsVerification(t));
}

/** Collect known playability issues without running network checks. */
export function getPlayabilityIssues(tracks: Track[]): InvalidTrackEntry[] {
  const issues: InvalidTrackEntry[] = [];

  for (const track of tracks) {
    if (!track.youtubeVideoId) {
      issues.push({ track, reason: "No YouTube video matched" });
      continue;
    }
    if (track.matchStatus === "failed") {
      issues.push({ track, reason: "Video matching failed" });
      continue;
    }
    if (isTrackNeedsVerification(track)) {
      issues.push({ track, reason: "Audio compatibility not yet verified" });
      continue;
    }
    const cached = getCachedEmbedStatus(track.youtubeVideoId);
    if (cached && !cached.embeddable) {
      issues.push({
        track,
        reason: cached.reason || "Embedding blocked by video owner",
        validation: cached,
      });
    }
  }

  return issues;
}

export function markTracksAsFailed(tracks: Track[], failedTrackIds: Set<string>): Track[] {
  return tracks.map((t) =>
    failedTrackIds.has(t.id) ? { ...t, matchStatus: "failed" as const } : t
  );
}

/**
 * Validates deck playability. Checks uncached videos by default; use forceRecheck to probe all.
 */
export async function ensureDeckPlayable(
  tracks: Track[],
  options?: {
    forceRecheck?: boolean;
    concurrency?: number;
    onProgress?: (progress: BatchValidationProgress) => void;
    shouldCancel?: () => boolean;
  }
): Promise<DeckPlayabilityResult> {
  const validatedAt = Date.now();
  const concurrency = options?.concurrency ?? 3;

  const tracksNeedingCheck = tracks.filter((t) => {
    if (!t.youtubeVideoId) return false;
    if (options?.forceRecheck) return true;
    return isTrackNeedsVerification(t);
  });

  const validationInvalid: Array<{ track: Track; validation: EmbedValidationResult }> = [];
  const alreadyChecked = tracks.length - tracksNeedingCheck.length;

  if (tracksNeedingCheck.length > 0) {
    if (options?.forceRecheck) {
      let completed = alreadyChecked;
      let valid = 0;
      let invalid = 0;
      let nextIdx = 0;

      async function worker() {
        while (nextIdx < tracksNeedingCheck.length) {
          if (options?.shouldCancel?.()) break;
          const track = tracksNeedingCheck[nextIdx++];
          const res = await checkVideoEmbeddable(track.youtubeVideoId!, true);
          completed++;
          if (res.embeddable) valid++;
          else {
            invalid++;
            validationInvalid.push({ track, validation: res });
          }
          options?.onProgress?.({
            total: tracks.length,
            completed,
            valid,
            invalid,
            currentTrackTitle: track.title,
          });
        }
      }

      const workers = Array.from(
        { length: Math.min(concurrency, tracksNeedingCheck.length) },
        () => worker()
      );
      await Promise.all(workers);
    } else {
      await validateTracksEmbeddability(
        tracksNeedingCheck,
        concurrency,
        (prog, _res, track) => {
          options?.onProgress?.({
            total: tracks.length,
            completed: alreadyChecked + prog.completed,
            valid: prog.valid,
            invalid: prog.invalid,
            currentTrackTitle: track.title,
          });
        },
        options?.shouldCancel
      );

      for (const track of tracksNeedingCheck) {
        if (!track.youtubeVideoId) continue;
        const cached = getCachedEmbedStatus(track.youtubeVideoId);
        if (cached && !cached.embeddable) {
          validationInvalid.push({ track, validation: cached });
        }
      }
    }
  }

  const invalidTracks: InvalidTrackEntry[] = getPlayabilityIssues(tracks);

  for (const { track, validation } of validationInvalid) {
    if (!invalidTracks.some((i) => i.track.id === track.id)) {
      invalidTracks.push({
        track,
        reason: validation.reason || "Embedding blocked by video owner",
        validation,
      });
    } else {
      const existing = invalidTracks.find((i) => i.track.id === track.id);
      if (existing) {
        existing.reason = validation.reason || existing.reason;
        existing.validation = validation;
      }
    }
  }

  return {
    playable: invalidTracks.length === 0,
    invalidTracks,
    validatedAt,
  };
}
