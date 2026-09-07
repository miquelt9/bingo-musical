import { Track } from "../../types/deck";

/** 1-based song number from current deck order. Returns null if the track is not in the deck. */
export function getTrackSongNumber(tracks: Track[], trackId: string): number | null {
  const index = tracks.findIndex((t) => t.id === trackId);
  return index >= 0 ? index + 1 : null;
}

export function buildTrackSongNumberMap(tracks: Track[]): Map<string, number> {
  const map = new Map<string, number>();
  tracks.forEach((track, index) => {
    map.set(track.id, index + 1);
  });
  return map;
}
