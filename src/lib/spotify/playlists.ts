import { Track, Deck } from "../../types/deck";

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  totalTracks: number;
  ownerName: string;
}

export interface SpotifyTrackItem {
  track: {
    id: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album?: {
      name: string;
      images: Array<{ url: string; width?: number; height?: number }>;
    };
    is_local?: boolean;
    type?: string;
  } | null;
}

export function parseSpotifyPlaylistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Plain alphanumeric ID
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
    return trimmed;
  }

  // spotify:playlist:xxxx
  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]{22})/i);
  if (uriMatch) {
    return uriMatch[1];
  }

  // URL matching: https://open.spotify.com/playlist/xxxx
  const urlMatch = trimmed.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]{22})/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

export async function fetchUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = [];
  let nextUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("Spotify session expired. Please log in again.");
      throw new Error(`Failed to load playlists (HTTP ${res.status})`);
    }

    const data: {
      items: Array<{
        id: string;
        name: string;
        description?: string;
        images?: Array<{ url: string }>;
        tracks?: { total: number };
        owner?: { display_name?: string };
      }>;
      next: string | null;
    } = await res.json();

    for (const item of data.items || []) {
      playlists.push({
        id: item.id,
        name: item.name,
        description: item.description || "",
        imageUrl: item.images?.[0]?.url || null,
        totalTracks: item.tracks?.total || 0,
        ownerName: item.owner?.display_name || "Spotify User",
      });
    }

    nextUrl = data.next;
    // Cap at 200 playlists to avoid excessive paging in massive accounts
    if (playlists.length >= 200) break;
  }

  return playlists;
}

export async function fetchPlaylistDetails(
  playlistId: string,
  accessToken: string
): Promise<SpotifyPlaylistSummary> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,tracks.total,owner.display_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Playlist not found or is private.");
    if (res.status === 401) throw new Error("Spotify session expired. Please log in again.");
    throw new Error(`Failed to fetch playlist details (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    description: data.description || "",
    imageUrl: data.images?.[0]?.url || null,
    totalTracks: data.tracks?.total || 0,
    ownerName: data.owner?.display_name || "Spotify User",
  };
}

export async function fetchAllPlaylistTracks(
  playlistId: string,
  accessToken: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Track[]> {
  const tracks: Track[] = [];
  const seenIds = new Set<string>();
  let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let totalTracks = 0;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("Spotify session expired. Please log in again.");
      throw new Error(`Failed to fetch playlist tracks (HTTP ${res.status})`);
    }

    const data: {
      items: SpotifyTrackItem[];
      total: number;
      next: string | null;
    } = await res.json();

    totalTracks = data.total || 0;

    for (const item of data.items || []) {
      const mapped = item.track ? mapSpotifyTrackItem(item.track, seenIds) : null;
      if (mapped) tracks.push(mapped);
    }

    if (onProgress) {
      onProgress(tracks.length, totalTracks);
    }

    nextUrl = data.next;
  }

  return tracks;
}

function mapSpotifyTrackItem(t: NonNullable<SpotifyTrackItem["track"]>, seenIds: Set<string>): Track | null {
  if (!t.id || !t.name || t.is_local) return null;
  if (seenIds.has(t.id)) return null;
  seenIds.add(t.id);

  const durationSec = Math.floor((t.duration_ms || 180000) / 1000);
  const defaultStart = durationSec > 40 ? 30 : 0;
  const defaultEnd = Math.min(defaultStart + 15, durationSec > 0 ? durationSec : defaultStart + 15);

  const albumArtUrl = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "";

  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
    album: t.album?.name || "",
    albumArtUrl,
    durationMs: t.duration_ms || 180000,
    youtubeVideoId: null,
    startTime: defaultStart,
    endTime: defaultEnd,
    matchStatus: "pending",
  };
}

export async function fetchSavedTracks(
  accessToken: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Track[]> {
  const tracks: Track[] = [];
  const seenIds = new Set<string>();
  let nextUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
  let totalTracks = 0;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("Spotify session expired. Please log in again.");
      if (res.status === 403) {
        throw new Error("Missing permission to read liked songs. Disconnect and reconnect Spotify.");
      }
      throw new Error(`Failed to fetch liked songs (HTTP ${res.status})`);
    }

    const data: {
      items: SpotifyTrackItem[];
      total: number;
      next: string | null;
    } = await res.json();

    totalTracks = data.total || 0;

    for (const item of data.items || []) {
      const mapped = item.track ? mapSpotifyTrackItem(item.track, seenIds) : null;
      if (mapped) tracks.push(mapped);
    }

    if (onProgress) {
      onProgress(tracks.length, totalTracks);
    }

    nextUrl = data.next;
  }

  return tracks;
}

export function createDeckFromLikedSongs(tracks: Track[]): Deck {
  return createDeckFromSpotify(
    {
      id: "liked-songs",
      name: "Liked Songs",
      description: "",
      imageUrl: null,
      totalTracks: tracks.length,
      ownerName: "You",
    },
    tracks
  );
}

export function createDeckFromSpotify(
  playlist: SpotifyPlaylistSummary,
  tracks: Track[]
): Deck {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `deck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: playlist.name || "Musical Bingo Deck",
    createdAt: now,
    updatedAt: now,
    source: {
      type: "spotify-playlist",
      playlistId: playlist.id,
      url: `https://open.spotify.com/playlist/${playlist.id}`,
      name: playlist.name,
    },
    tracks,
  };
}
