import { Track } from "../../types/deck";
import { defaultClipWindow } from "../tracks";
import { guessTitleArtist, searchYoutubeVideos, YoutubeSearchHit } from "./search";
import { checkHitsEmbeddability, isTrackUnplayable } from "./validator";

export interface MatchResult {
  videoId: string | null;
  videoTitle?: string;
  videoAuthor?: string;
  videoLengthSeconds?: number;
  sourceInstance?: string;
  error?: string;
}

function compactMusicText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isUnknownArtist(artist: string): boolean {
  return /^unknown artist$/i.test(artist.trim());
}

function musicTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

const MIN_AUTO_MATCH_DURATION_SECONDS = 15;

/** Prevent auto-match from attaching a playable but unrelated search result. */
function hitMatchesTrack(track: Pick<Track, "title" | "artist" | "searchQuery">, hit: YoutubeSearchHit): boolean {
  const query = isUnknownArtist(track.artist) ? track.searchQuery?.trim() || track.title : track.title;
  const queryTokens = musicTokens(query);
  const resultTokens = new Set(musicTokens(`${hit.title} ${hit.author}`));
  if (queryTokens.length === 0 || !queryTokens.every((token) => resultTokens.has(token))) return false;

  if (isUnknownArtist(track.artist)) return true;
  const artist = compactMusicText(track.artist.split(/[,/&]/)[0].trim());
  return Boolean(artist && compactMusicText(`${hit.title} ${hit.author}`).includes(artist));
}

async function findFirstPlayableHit(
  track: Pick<Track, "title" | "artist" | "searchQuery">,
  hits: YoutubeSearchHit[],
): Promise<YoutubeSearchHit | null> {
  const matchingHits = hits
    .filter((hit) => hitMatchesTrack(track, hit))
    .filter((hit) => hit.lengthSeconds <= 0 || hit.lengthSeconds >= MIN_AUTO_MATCH_DURATION_SECONDS);
  if (matchingHits.length === 0) return null;
  const statuses = await checkHitsEmbeddability(matchingHits);
  return matchingHits.find((hit) => statuses.get(hit.videoId)?.embeddable) ?? null;
}

export function cleanSearchQuery(track: Pick<Track, "title" | "artist" | "searchQuery">): string {
  const explicitQuery = track.searchQuery?.trim();
  if (explicitQuery) return explicitQuery;

  const cleanTitle = track.title
    .replace(/\s*[\(\[](?:feat|ft|with|prod)[\.\s][^\)\]]+[\)\]]/gi, "")
    .replace(/\s*[\(\[](?:remastered|remaster|radio edit|original mix|bonus track|deluxe|version)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*remaster(?:ed)?(?:\s*\d+)?/gi, "")
    .trim();

  const firstArtist = track.artist.split(/[,/&]/)[0].trim();
  const artistQuery = /^unknown artist$/i.test(firstArtist) ? "" : firstArtist;
  return [artistQuery, cleanTitle].filter(Boolean).join(" ");
}

export async function matchTrackWithYoutube(track: Pick<Track, "title" | "artist" | "searchQuery">): Promise<MatchResult> {
  const baseQuery = cleanSearchQuery(track);
  
  // 1. Try standard query
  let hits = await searchYoutubeVideos(baseQuery, 8);
  let embeddableHit: YoutubeSearchHit | null = null;

  if (hits.length > 0) {
    embeddableHit = await findFirstPlayableHit(track, hits);
  }

  // 2. If no embeddable hit found from standard query, try searching specifically for audio/topic version
  if (!embeddableHit) {
    const audioQuery = `${baseQuery} official audio`;
    const audioHits = await searchYoutubeVideos(audioQuery, 6);
    if (audioHits.length > 0) {
      embeddableHit = await findFirstPlayableHit(track, audioHits);
    }
  }

  // 3. If still not found, try lyric video
  if (!embeddableHit) {
    const lyricQuery = `${baseQuery} lyrics`;
    const lyricHits = await searchYoutubeVideos(lyricQuery, 6);
    if (lyricHits.length > 0) {
      embeddableHit = await findFirstPlayableHit(track, lyricHits);
    }
  }

  // 4. If we found a playable candidate, return it
  if (embeddableHit) {
    return {
      videoId: embeddableHit.videoId,
      videoTitle: embeddableHit.title,
      videoAuthor: embeddableHit.author,
      videoLengthSeconds: embeddableHit.lengthSeconds,
    };
  }

  // 5. If hits existed but all failed embed checks
  if (hits.length > 0) {
    return {
      videoId: null,
      error: "YouTube videos were found, but all had embedding disabled by the video owners. Please search and select an alternative manually.",
    };
  }

  return {
    videoId: null,
    error: "No public search instance returned YouTube results. You can paste the YouTube URL manually.",
  };
}

export interface BatchMatchProgress {
  total: number;
  completed: number;
  matched: number;
  failed: number;
  currentTrackTitle?: string;
}

export async function batchMatchTracks(
  tracks: Track[],
  concurrency = 2,
  onProgress?: (progress: BatchMatchProgress, updatedTrack: Track) => void,
  shouldCancel?: () => boolean
): Promise<Track[]> {
  const results = [...tracks];
  const pendingIndices = results
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) =>
      !t.media
      || t.media.provider !== "youtube"
      || t.matchStatus === "pending"
      || t.matchStatus === "failed"
      || isTrackUnplayable(t)
    );

  let completed = tracks.length - pendingIndices.length;
  let matched = tracks.filter((t) => t.matchStatus === "matched" || t.matchStatus === "manual").length;
  let failed = tracks.filter((t) => t.matchStatus === "failed").length;

  let nextIdx = 0;

  async function worker() {
    while (nextIdx < pendingIndices.length) {
      if (shouldCancel && shouldCancel()) break;

      const current = pendingIndices[nextIdx++];
      const track = results[current.idx];

      const match = await matchTrackWithYoutube(track);

      if (shouldCancel && shouldCancel()) break;

      if (match.videoId) {
        const guessed = match.videoTitle
          ? guessTitleArtist(match.videoTitle, match.videoAuthor ?? "")
          : null;
        const useProviderMetadata = isUnknownArtist(track.artist) && guessed;
        const matchedDurationMs = match.videoLengthSeconds && match.videoLengthSeconds > 0
          ? match.videoLengthSeconds * 1000
          : track.durationMs;
        const useMatchedClipWindow = !track.media || track.matchStatus === "pending";
        const matchedWindow = defaultClipWindow(matchedDurationMs);
        results[current.idx] = {
          ...track,
          title: useProviderMetadata ? guessed.title : track.title,
          artist: useProviderMetadata ? guessed.artist : track.artist,
          durationMs: useMatchedClipWindow ? matchedDurationMs : track.durationMs,
          startTime: useMatchedClipWindow ? matchedWindow.startTime : track.startTime,
          endTime: useMatchedClipWindow ? matchedWindow.endTime : track.endTime,
          media: match.videoId
            ? { provider: "youtube", id: match.videoId, providerTitle: match.videoTitle }
            : null,
          matchStatus: "matched",
        };
        matched++;
      } else {
        results[current.idx] = {
          ...track,
          matchStatus: "failed",
        };
        failed++;
      }

      completed++;

      if (onProgress) {
        onProgress(
          {
            total: tracks.length,
            completed,
            matched,
            failed,
            currentTrackTitle: track.title,
          },
          results[current.idx]
        );
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pendingIndices.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
