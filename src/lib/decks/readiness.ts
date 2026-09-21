import { Track } from "../../types/deck";
import { cellCount, normalizeGridSize } from "../bingo/generateCards";
import { canStartGame, isTrackNeedsVerification } from "../youtube/playabilityGate";
import { getUnplayableTracks, isTrackUnplayable } from "../youtube/validator";
import { getTrackProvider, isTrackPlayable } from "../music/providers";
import { isDeferredDeezerPreview } from "../deezer/previewUrl";

export type DeckHealth = "ready" | "needs_fix" | "empty" | "too_few" | "previews_pending";

export interface DeckReadiness {
  total: number;
  /** Tracks with a currently usable playback source. */
  readyCount: number;
  /** Tracks with a valid matched source, including deferred Deezer previews. */
  matchedCount: number;
  blockedCount: number;
  unmatchedCount: number;
  /** Matched Deezer sources whose signed preview URL will be loaded on click. */
  deferredPreviewCount: number;
  needsVerificationCount: number;
  canHost: boolean;
  health: DeckHealth;
  /** Minimum tracks to host a meaningful game */
  minHostTracks: number;
  tooFewForHost: boolean;
}

export const MIN_HOST_TRACKS = 10;
/** Smallest bingo grid (3×3) — Cards nav unlocks at this many songs. */
export const MIN_CARDS_TRACKS = 9;
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

/** A track is ready when its selected provider has a usable playback source. */
export function getDeckReadiness(tracks: Track[], _gridSize = 5): DeckReadiness {
  const total = tracks.length;
  const deferredPreviewCount = tracks.filter(isDeferredDeezerPreview).length;
  const blockedCount = getUnplayableTracks(tracks).filter((track) => !isDeferredDeezerPreview(track)).length;
  const unmatchedCount = tracks.filter((t) => !t.media).length;
  const readyCount = tracks.filter(
    (t) => isTrackPlayable(t) && !isTrackUnplayable(t)
  ).length;
  const matchedCount = tracks.filter(
    (track) => Boolean(track.media) && (track.matchStatus !== "failed" || isDeferredDeezerPreview(track))
  ).length;
  const needsVerificationCount = tracks.filter(
    (t) => getTrackProvider(t) === "youtube" && isTrackNeedsVerification(t)
  ).length;

  const minHostTracks = MIN_HOST_TRACKS;
  const tooFewForHost = readyCount < minHostTracks;
  const canHost = canStartGame(tracks) && !tooFewForHost;

  let health: DeckHealth = "ready";
  if (total === 0) health = "empty";
  else if (blockedCount > 0 || unmatchedCount > 0) health = "needs_fix";
  else if (deferredPreviewCount > 0) health = "previews_pending";
  else if (tooFewForHost) health = "too_few";

  return {
    total,
    readyCount,
    matchedCount,
    blockedCount,
    unmatchedCount,
    deferredPreviewCount,
    needsVerificationCount,
    canHost,
    health,
    minHostTracks,
    tooFewForHost,
  };
}

export function formatReadinessPrimary(readiness: DeckReadiness): string {
  // Deezer share/import payloads intentionally omit short-lived signed preview
  // URLs. Their stable IDs are already matched, even though playback metadata
  // will be refreshed later, so do not present those tracks as unmatched.
  if (readiness.deferredPreviewCount > 0) {
    const verificationSuffix = readiness.needsVerificationCount > 0 ? " · verifying…" : "";
    return `${readiness.matchedCount}/${readiness.total} matched${verificationSuffix}`;
  }

  const base = `${readiness.readyCount}/${readiness.total} ready to play`;
  if (readiness.needsVerificationCount > 0) {
    return `${readiness.matchedCount}/${readiness.total} matched · verifying…`;
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
  if (readiness.deferredPreviewCount > 0) {
    return `${readiness.deferredPreviewCount} Deezer preview${readiness.deferredPreviewCount === 1 ? "" : "s"} load when you click Preview`;
  }
  if (readiness.unmatchedCount > 0) {
    return `${readiness.unmatchedCount} unmatched`;
  }
  if (readiness.readyCount < MIN_CARDS_TRACKS) {
    return `Need ${MIN_CARDS_TRACKS} songs to print cards · ${MIN_HOST_TRACKS} to host`;
  }
  if (readiness.tooFewForHost) {
    return `Need ${MIN_HOST_TRACKS} songs to host`;
  }
  if (readiness.readyCount < getRecommendedTrackCount(5)) {
    return `A 5×5 card works best with about ${getRecommendedTrackCount(5)} songs`;
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
