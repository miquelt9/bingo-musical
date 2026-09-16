import { Track } from "../../types/deck";

type TrackIdentity = Pick<Track, "id">;

/** 1-based song number from canonical deck order. Returns null if the track is not in the deck. */
export function getTrackSongNumber(tracks: TrackIdentity[], trackId: string): number | null {
  const index = tracks.findIndex((t) => t.id === trackId);
  return index >= 0 ? index + 1 : null;
}

export function buildTrackSongNumberMap(tracks: TrackIdentity[]): Map<string, number> {
  const map = new Map<string, number>();
  tracks.forEach((track, index) => {
    map.set(track.id, index + 1);
  });
  return map;
}
