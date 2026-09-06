import { MusicProvider, Track } from "../../types/deck";
import {
  CatalogSong,
  catalogYoutubeQuery,
  searchCatalogSongs,
} from "./catalog";
import {
  DeezerTrackHit,
  deezerHitToTrack,
  fetchDeezerRelatedTracks,
  searchDeezerTracks,
} from "../deezer/api";
import {
  YoutubeSearchHit,
  hitToTrack,
  searchYoutubeVideos,
} from "../youtube/search";
import { checkHitsEmbeddability } from "../youtube/validator";
import { getTrackSourceId } from "./providers";

export const SUGGEST_RESULT_CAP = 16;
export const SUGGEST_SEED_CAP = 5;

export type SuggestHit =
  | { provider: "deezer"; hit: DeezerTrackHit }
  | {
      provider: "youtube";
      hit: YoutubeSearchHit;
      embeddable: boolean;
      catalog?: Pick<CatalogSong, "title" | "artist" | "album" | "artworkUrl" | "durationMs">;
    };

export interface SuggestSongsOptions {
  provider: MusicProvider;
  seeds: Track[];
  excludeIds?: Array<string | null | undefined>;
  /** Existing deck tracks — used to skip same title+artist, not just same video id. */
  excludeTracks?: Array<Pick<Track, "title" | "artist">>;
  limit?: number;
  signal?: AbortSignal;
}

function normalizeArtistKey(artist: string): string {
  return artist.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalize title+artist for duplicate detection across uploads of the same song. */
export function songIdentityKey(artist: string, title: string): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/\b(official|audio|video|lyrics?|live|remix|remaster(?:ed)?|version|hd|4k)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  return `${norm(artist)}::${norm(title)}`;
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

function firstArtistName(artist: string): string {
  return artist.split(/[,/&]| feat\.? | ft\.? /i)[0].trim();
}

async function collectCatalogSuggestions(
  seeds: Track[],
  excludeSongs: Set<string>,
  limit: number,
  signal?: AbortSignal
): Promise<CatalogSong[]> {
  const bySong = new Map<string, CatalogSong>();
  const artistQueries = [
    ...new Set(
      seeds
        .map((seed) => firstArtistName(seed.artist))
        .filter((artist) => artist.length >= 2)
    ),
  ].slice(0, SUGGEST_SEED_CAP);

  for (const artist of artistQueries) {
    if (signal?.aborted || bySong.size >= limit) break;
    try {
      const songs = await searchCatalogSongs(artist, signal);
      for (const song of songs) {
        const key = songIdentityKey(song.artist, song.title);
        if (key === "::" || excludeSongs.has(key) || bySong.has(key)) continue;
        // Keep results that look like the queried artist (avoid total query noise).
        const seedArtist = normalizeArtistKey(artist);
        const songArtist = normalizeArtistKey(firstArtistName(song.artist));
        if (
          seedArtist &&
          songArtist &&
          !songArtist.includes(seedArtist) &&
          !seedArtist.includes(songArtist)
        ) {
          continue;
        }
        bySong.set(key, song);
        if (bySong.size >= limit) break;
      }
    } catch {
      // Continue with remaining artists.
    }
  }

  return [...bySong.values()].slice(0, limit);
}

async function resolveCatalogToYoutube(
  song: CatalogSong,
  signal?: AbortSignal
): Promise<{ hit: YoutubeSearchHit; embeddable: boolean } | null> {
  const query = catalogYoutubeQuery(song);
  if (!query) return null;
  const hits = await searchYoutubeVideos(query, 6, signal);
  if (hits.length === 0 || signal?.aborted) return null;

  const embedMap = await checkHitsEmbeddability(hits.slice(0, 4));
  for (const hit of hits) {
    if (embedMap.get(hit.videoId)?.embeddable) {
      return { hit, embeddable: true };
    }
  }
  return null;
}

async function suggestYoutube(
  seeds: Track[],
  excludeIds: Set<string>,
  excludeSongs: Set<string>,
  limit: number,
  signal?: AbortSignal
): Promise<SuggestHit[]> {
  const catalogSongs = await collectCatalogSuggestions(seeds, excludeSongs, Math.max(limit * 2, 12), signal);
  if (catalogSongs.length === 0 || signal?.aborted) return [];

  const results: SuggestHit[] = [];
  const usedVideoIds = new Set(excludeIds);
  const usedSongs = new Set(excludeSongs);

  for (const song of catalogSongs) {
    if (signal?.aborted || results.length >= limit) break;
    const songKey = songIdentityKey(song.artist, song.title);
    if (usedSongs.has(songKey)) continue;

    try {
      const resolved = await resolveCatalogToYoutube(song, signal);
      if (!resolved || usedVideoIds.has(resolved.hit.videoId)) continue;
      usedVideoIds.add(resolved.hit.videoId);
      usedSongs.add(songKey);
      results.push({
        provider: "youtube",
        hit: resolved.hit,
        embeddable: resolved.embeddable,
        catalog: {
          title: song.title,
          artist: song.artist,
          album: song.album,
          artworkUrl: song.artworkUrl,
          durationMs: song.durationMs,
        },
      });
    } catch {
      // Continue with remaining catalog songs.
    }
  }

  return results.slice(0, limit);
}

export async function suggestSongs(options: SuggestSongsOptions): Promise<SuggestHit[]> {
  const limit = Math.max(1, Math.min(SUGGEST_RESULT_CAP, options.limit ?? SUGGEST_RESULT_CAP));
  const seeds = options.seeds.slice(0, SUGGEST_SEED_CAP);
  if (seeds.length === 0) return [];

  const excludeIds = new Set(
    (options.excludeIds || [])
      .filter((id): id is string => Boolean(id))
      .concat(seeds.map((seed) => getTrackSourceId(seed)).filter((id): id is string => Boolean(id)))
  );

  if (options.provider === "deezer") {
    return suggestDeezer(seeds, excludeIds, limit, options.signal);
  }

  const excludeSongs = new Set(
    [...seeds, ...(options.excludeTracks || [])]
      .map((track) => songIdentityKey(track.artist, track.title))
      .filter((key) => key !== "::")
  );

  return suggestYoutube(seeds, excludeIds, excludeSongs, limit, options.signal);
}

export function suggestHitId(item: SuggestHit): string {
  return item.provider === "deezer" ? item.hit.id : item.hit.videoId;
}

export function suggestHitToTrack(item: SuggestHit): Track {
  if (item.provider === "deezer") return deezerHitToTrack(item.hit);
  return hitToTrack(item.hit, item.catalog);
}

export function suggestHitPlayable(item: SuggestHit): boolean {
  return item.provider === "deezer" ? Boolean(item.hit.previewUrl) : item.embeddable;
}
