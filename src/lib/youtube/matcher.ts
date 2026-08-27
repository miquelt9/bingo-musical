import { Track } from "../../types/deck";
import { searchYoutubeVideos, YoutubeSearchHit } from "./search";
import { findFirstEmbeddableHit } from "./validator";

export interface MatchResult {
  videoId: string | null;
  videoTitle?: string;
  sourceInstance?: string;
  error?: string;
}

export function cleanSearchQuery(track: Pick<Track, "title" | "artist">): string {
  const cleanTitle = track.title
    .replace(/\s*[\(\[](?:feat|ft|with|prod)[\.\s][^\)\]]+[\)\]]/gi, "")
    .replace(/\s*[\(\[](?:remastered|remaster|radio edit|original mix|bonus track|deluxe|version)[^\)\]]*[\)\]]/gi, "")
    .replace(/\s*-\s*remaster(?:ed)?(?:\s*\d+)?/gi, "")
    .trim();

  const firstArtist = track.artist.split(/[,/&]/)[0].trim();
  return `${firstArtist} ${cleanTitle}`;
}

export async function matchTrackWithYoutube(track: Pick<Track, "title" | "artist">): Promise<MatchResult> {
  const baseQuery = cleanSearchQuery(track);
  
  // 1. Try standard query
  let hits = await searchYoutubeVideos(baseQuery, 8);
  let embeddableHit: YoutubeSearchHit | null = null;

  if (hits.length > 0) {
    embeddableHit = await findFirstEmbeddableHit(hits);
  }

  // 2. If no embeddable hit found from standard query, try searching specifically for audio/topic version
  if (!embeddableHit) {
    const audioQuery = `${baseQuery} official audio`;
    const audioHits = await searchYoutubeVideos(audioQuery, 6);
    if (audioHits.length > 0) {
      embeddableHit = await findFirstEmbeddableHit(audioHits);
    }
  }

  // 3. If still not found, try lyric video
  if (!embeddableHit) {
    const lyricQuery = `${baseQuery} lyrics`;
    const lyricHits = await searchYoutubeVideos(lyricQuery, 6);
    if (lyricHits.length > 0) {
      embeddableHit = await findFirstEmbeddableHit(lyricHits);
    }
  }

  // 4. If we found a playable candidate, return it
  if (embeddableHit) {
    return {
      videoId: embeddableHit.videoId,
      videoTitle: embeddableHit.title,
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
    .filter(({ t }) => !t.youtubeVideoId || t.matchStatus === "pending" || t.matchStatus === "failed");

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
        results[current.idx] = {
          ...track,
          youtubeVideoId: match.videoId,
          youtubeTitle: match.videoTitle,
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
