import { fetchWithTimeout } from "../youtube/instances";

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  source: "itunes" | "deezer" | "musicbrainz";
}

function uniqueSongs(songs: CatalogSong[]): CatalogSong[] {
  const seen = new Set<string>();
  const out: CatalogSong[] = [];
  for (const song of songs) {
    const key = `${song.artist.toLowerCase()}::${song.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(song);
  }
  return out;
}

async function searchItunes(query: string, signal?: AbortSignal): Promise<CatalogSong[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&media=music&limit=8`;
  const res = await fetchWithTimeout(url, 4000, signal);
  if (signal?.aborted) return [];
  if (!res.ok) return [];
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .filter((item: { wrapperType?: string; kind?: string }) => item.kind === "song" || item.wrapperType === "track")
    .map((item: {
      trackId?: number;
      trackName?: string;
      artistName?: string;
      collectionName?: string;
      artworkUrl100?: string;
      artworkUrl60?: string;
      trackTimeMillis?: number;
    }) => ({
      id: `itunes-${item.trackId ?? `${item.artistName}-${item.trackName}`}`,
      title: (item.trackName || "").trim(),
      artist: (item.artistName || "").trim(),
      album: item.collectionName,
      artworkUrl: (item.artworkUrl100 || item.artworkUrl60 || "").replace("100x100", "200x200"),
      durationMs: item.trackTimeMillis,
      source: "itunes" as const,
    }))
    .filter((song: CatalogSong) => song.title && song.artist);
}

async function searchDeezer(query: string, signal?: AbortSignal): Promise<CatalogSong[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=8`;
  const res = await fetchWithTimeout(url, 4000, signal);
  if (signal?.aborted) return [];
  if (!res.ok) return [];
  const data = await res.json();
  const results = Array.isArray(data.data) ? data.data : [];
  return results
    .map((item: {
      id?: number;
      title?: string;
      duration?: number;
      artist?: { name?: string };
      album?: { title?: string; cover_medium?: string; cover_small?: string };
    }) => ({
      id: `deezer-${item.id ?? `${item.artist?.name}-${item.title}`}`,
      title: (item.title || "").trim(),
      artist: (item.artist?.name || "").trim(),
      album: item.album?.title,
      artworkUrl: item.album?.cover_medium || item.album?.cover_small || "",
      durationMs: typeof item.duration === "number" ? item.duration * 1000 : undefined,
      source: "deezer" as const,
    }))
    .filter((song: CatalogSong) => song.title && song.artist);
}

async function searchMusicBrainz(query: string, signal?: AbortSignal): Promise<CatalogSong[]> {
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
  const res = await fetchWithTimeout(url, 4000, signal);
  if (signal?.aborted) return [];
  if (!res.ok) return [];
  const data = await res.json();
  const recordings = Array.isArray(data.recordings) ? data.recordings : [];
  return recordings
    .map((item: {
      id?: string;
      title?: string;
      length?: number;
      "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
      releases?: Array<{ title?: string }>;
    }) => {
      const credit = item["artist-credit"]?.[0];
      const artist = credit?.name || credit?.artist?.name || "";
      return {
        id: `mb-${item.id ?? `${artist}-${item.title}`}`,
        title: (item.title || "").trim(),
        artist: artist.trim(),
        album: item.releases?.[0]?.title,
        durationMs: item.length,
        source: "musicbrainz" as const,
      };
    })
    .filter((song: CatalogSong) => song.title && song.artist);
}

export function catalogYoutubeQuery(song: Pick<CatalogSong, "artist" | "title">): string {
  const firstArtist = song.artist.split(/[,/&]/)[0].trim();
  return `${firstArtist} ${song.title} official audio`;
}

export async function searchCatalogSongs(query: string, signal?: AbortSignal): Promise<CatalogSong[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const itunes = await searchItunes(q, signal);
    if (itunes.length > 0) return uniqueSongs(itunes).slice(0, 8);
  } catch {
    // fall through
  }

  try {
    const deezer = await searchDeezer(q, signal);
    if (deezer.length > 0) return uniqueSongs(deezer).slice(0, 8);
  } catch {
    // fall through
  }

  try {
    const musicbrainz = await searchMusicBrainz(q, signal);
    return uniqueSongs(musicbrainz).slice(0, 8);
  } catch {
    return [];
  }
}
