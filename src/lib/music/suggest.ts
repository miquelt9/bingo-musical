import { MusicProvider, Track } from "../../types/deck";
import {
  DeezerTrackHit,
  deezerHitToTrack,
  fetchDeezerRelatedTracks,
  searchDeezerTracks,
} from "../deezer/api";
import {
  YoutubeSearchHit,
  fetchRelatedYoutubeVideos,
  hitToTrack,
  searchYoutubeVideos,
} from "../youtube/search";
import { checkHitsEmbeddability } from "../youtube/validator";
import { getTrackSourceId } from "./providers";

export const SUGGEST_RESULT_CAP = 16;
export const SUGGEST_SEED_CAP = 5;

export type SuggestHit =
  | { provider: "deezer"; hit: DeezerTrackHit }
  | { provider: "youtube"; hit: YoutubeSearchHit; embeddable: boolean };

export interface SuggestSongsOptions {
  provider: MusicProvider;
  seeds: Track[];
  excludeIds?: Array<string | null | undefined>;
  limit?: number;
  signal?: AbortSignal;
}

function normalizeArtistKey(artist: string): string {
  return artist.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Pick up to SUGGEST_SEED_CAP tracks covering distinct artists when possible. */
export function pickSuggestSeeds(tracks: Track[], maxSeeds = SUGGEST_SEED_CAP): Track[] {
  if (tracks.length === 0) return [];
  const picked: Track[] = [];
  const seenArtists = new Set<string>();

  for (const track of tracks) {
    if (picked.length >= maxSeeds) break;
    const key = normalizeArtistKey(track.artist) || track.id;
    if (seenArtists.has(key)) continue;
    seenArtists.add(key);
    picked.push(track);
  }

  if (picked.length < maxSeeds) {
    for (const track of tracks) {
      if (picked.length >= maxSeeds) break;
      if (picked.some((item) => item.id === track.id)) continue;
      picked.push(track);
    }
  }

  return picked;
}

async function resolveDeezerSeedId(seed: Track, signal?: AbortSignal): Promise<string | null> {
  if (seed.media?.provider === "deezer" && seed.media.id) return seed.media.id;
  const query = `${seed.artist} ${seed.title}`.trim();
  if (query.length < 2) return null;
  const hits = await searchDeezerTracks(query, 4, signal);
  return hits.find((hit) => hit.previewUrl)?.id ?? hits[0]?.id ?? null;
}

async function suggestDeezer(
  seeds: Track[],
  exclude: Set<string>,
  limit: number,
  signal?: AbortSignal
): Promise<SuggestHit[]> {
  const byId = new Map<string, DeezerTrackHit>();

  for (const seed of seeds) {
    if (signal?.aborted) break;
    try {
      const seedId = await resolveDeezerSeedId(seed, signal);
      if (!seedId) continue;
      const related = await fetchDeezerRelatedTracks(seedId, Math.min(12, limit), signal);
      for (const hit of related) {
        if (exclude.has(hit.id) || byId.has(hit.id)) continue;
        if (!hit.previewUrl) continue;
        byId.set(hit.id, hit);
        if (byId.size >= limit) break;
      }
    } catch {
      // Continue with remaining seeds.
    }
    if (byId.size >= limit) break;
  }

  return [...byId.values()].slice(0, limit).map((hit) => ({ provider: "deezer" as const, hit }));
}

async function suggestYoutube(
  seeds: Track[],
  exclude: Set<string>,
  limit: number,
  signal?: AbortSignal
): Promise<SuggestHit[]> {
  const byId = new Map<string, YoutubeSearchHit>();

  for (const seed of seeds) {
    if (signal?.aborted) break;
    try {
      let related: YoutubeSearchHit[] = [];
      if (seed.media?.provider === "youtube" && seed.media.id) {
        related = await fetchRelatedYoutubeVideos(seed.media.id, Math.min(12, limit), signal);
      }
      if (related.length === 0) {
        const query = `${seed.artist} ${seed.title}`.trim();
        if (query) related = await searchYoutubeVideos(query, Math.min(8, limit), signal);
      }
      for (const hit of related) {
        if (exclude.has(hit.videoId) || byId.has(hit.videoId)) continue;
        byId.set(hit.videoId, hit);
        if (byId.size >= limit) break;
      }
    } catch {
      // Continue with remaining seeds.
    }
    if (byId.size >= limit) break;
  }

  const candidates = [...byId.values()].slice(0, limit);
  if (candidates.length === 0) return [];

  const embedMap = await checkHitsEmbeddability(candidates);
  return candidates
    .map((hit) => ({
      provider: "youtube" as const,
      hit,
      embeddable: embedMap.get(hit.videoId)?.embeddable ?? false,
    }))
    .filter((item) => item.embeddable)
    .slice(0, limit);
}

export async function suggestSongs(options: SuggestSongsOptions): Promise<SuggestHit[]> {
  const limit = Math.max(1, Math.min(SUGGEST_RESULT_CAP, options.limit ?? SUGGEST_RESULT_CAP));
  const seeds = options.seeds.slice(0, SUGGEST_SEED_CAP);
  if (seeds.length === 0) return [];

  const exclude = new Set(
    (options.excludeIds || [])
      .filter((id): id is string => Boolean(id))
      .concat(seeds.map((seed) => getTrackSourceId(seed)).filter((id): id is string => Boolean(id)))
  );

  if (options.provider === "deezer") {
    return suggestDeezer(seeds, exclude, limit, options.signal);
  }
  return suggestYoutube(seeds, exclude, limit, options.signal);
}

export function suggestHitId(item: SuggestHit): string {
  return item.provider === "deezer" ? item.hit.id : item.hit.videoId;
}

export function suggestHitToTrack(item: SuggestHit): Track {
  return item.provider === "deezer" ? deezerHitToTrack(item.hit) : hitToTrack(item.hit);
}

export function suggestHitPlayable(item: SuggestHit): boolean {
  return item.provider === "deezer" ? Boolean(item.hit.previewUrl) : item.embeddable;
}
