import { Track } from "../../types/deck";
import { cellCount, normalizeGridSize } from "../bingo/generateCards";
import { canStartGame, isTrackNeedsVerification } from "../youtube/playabilityGate";
import { getUnplayableTracks, isTrackUnplayable } from "../youtube/validator";

export type DeckHealth = "ready" | "needs_fix" | "empty" | "too_few";

export interface DeckReadiness {
  total: number;
  readyCount: number;
  blockedCount: number;
  unmatchedCount: number;
  needsVerificationCount: number;
  canHost: boolean;
  health: DeckHealth;
  /** Minimum tracks to host a meaningful game */
  minHostTracks: number;
  tooFewForHost: boolean;
}

export const MIN_HOST_TRACKS = 10;
export const RECOMMENDED_TRACKS: Record<number, number> = {
  3: 9,
  4: 20,
  5: 28,
  6: 36,
};

export function getMinTracksForGrid(gridSize: number): number {
  return cellCount(normalizeGridSize(gridSize));
}

export function getRecommendedTrackCount(gridSize: number): number {
  const size = normalizeGridSize(gridSize);
  return RECOMMENDED_TRACKS[size] ?? getMinTracksForGrid(size);
}

export function isGridSizeValidForDeck(trackCount: number, gridSize: number): boolean {
  if (trackCount <= 0) return false;
  return trackCount >= getMinTracksForGrid(gridSize);
}

export function getLargestValidGridSize(trackCount: number): number {
  const sizes = [6, 5, 4, 3] as const;
  for (const size of sizes) {
    if (isGridSizeValidForDeck(trackCount, size)) return size;
  }
  return 3;
}

/** matched = has youtubeVideoId; ready = matched and not embed-blocked */
export function getDeckReadiness(tracks: Track[], gridSize = 5): DeckReadiness {
  const total = tracks.length;
  const blockedCount = getUnplayableTracks(tracks).length;
  const unmatchedCount = tracks.filter((t) => !t.youtubeVideoId).length;
  const readyCount = tracks.filter(
    (t) => t.youtubeVideoId && t.matchStatus !== "failed" && !isTrackUnplayable(t)
  ).length;
  const needsVerificationCount = tracks.filter(
    (t) => t.youtubeVideoId && t.matchStatus !== "failed" && isTrackNeedsVerification(t)
  ).length;

  const minHostTracks = Math.max(MIN_HOST_TRACKS, getMinTracksForGrid(gridSize));
  const tooFewForHost = readyCount < minHostTracks;
  const canHost = canStartGame(tracks) && !tooFewForHost;

  let health: DeckHealth = "ready";
  if (total === 0) health = "empty";
  else if (blockedCount > 0 || unmatchedCount > 0) health = "needs_fix";
  else if (tooFewForHost) health = "too_few";

  return {
    total,
    readyCount,
    blockedCount,
    unmatchedCount,
    needsVerificationCount,
    canHost,
    health,
    minHostTracks,
    tooFewForHost,
  };
}

export function formatReadinessPrimary(readiness: DeckReadiness): string {
  const base = `${readiness.readyCount}/${readiness.total} ready to play`;
  if (readiness.needsVerificationCount > 0) {
    return `${readiness.readyCount}/${readiness.total} matched · verifying…`;
  }
  return base;
}

export function formatReadinessSecondary(readiness: DeckReadiness): string | null {
  if (readiness.needsVerificationCount > 0 && readiness.canHost) {
    return null;
  }
  if (readiness.needsVerificationCount > 0) {
    return "Checking audio compatibility";
  }
  if (readiness.blockedCount > 0) {
    return `${readiness.blockedCount} need fixing`;
  }
  if (readiness.unmatchedCount > 0) {
    return `${readiness.unmatchedCount} unmatched`;
  }
  if (readiness.tooFewForHost) {
    return `Add more songs (need ${readiness.minHostTracks}+)`;
  }
  return null;
}

export function getNextDeckName(existingNames: string[]): string {
  const base = "New deck";
  const lower = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let i = 2;
  while (lower.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
