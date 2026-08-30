import { Track, Deck } from "../../types/deck";

export const MAX_USER_PLAYLISTS = 200;
export const MAX_LIKED_SONGS = 500;

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  totalTracks: number;
  ownerName: string;
}

export interface SpotifyTrackItem {
  track?: {
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
  /** Dev-mode playlist pages (Feb 2026+) use `item` instead of `track`. */
  item?: SpotifyTrackItem["track"];
}

type SpotifyTrackPayload = NonNullable<SpotifyTrackItem["track"]>;

const DEV_MODE_403_HINT =
  "Spotify Development Mode requires the app owner to have Premium, and each user must be on the allowlist with their exact Spotify account email. Disconnect and reconnect after fixing.";

async function throwSpotifyApiError(res: Response, action: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: number };
  };
  const detail = body.error?.message?.trim();

  if (res.status === 401) {
    throw new Error("Spotify session expired. Please log in again.");
  }

  if (res.status === 403) {
    throw new Error(
      detail
        ? `${detail} ${DEV_MODE_403_HINT}`
        : `Spotify denied permission to ${action}. ${DEV_MODE_403_HINT}`
    );
  }

  throw new Error(detail || `Failed to ${action} (HTTP ${res.status})`);
}

function trackFromPlaylistRow(row: SpotifyTrackItem): SpotifyTrackPayload | null {
  return row.track ?? row.item ?? null;
}

function playlistTrackCount(playlist: { items?: { total?: number }; tracks?: { total?: number } }): number {
  return playlist.items?.total ?? playlist.tracks?.total ?? 0;
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

export async function fetchUserPlaylists(
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = [];
  const limit = 50;
  let offset = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const res = await fetch(
      `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal }
    );

    if (!res.ok) {
      await throwSpotifyApiError(res, "load playlists");
    }

    const data: {
      items: Array<{
        id: string;
        name: string;
        description?: string;
        images?: Array<{ url: string }>;
        items?: { total: number };
        tracks?: { total: number };
        owner?: { display_name?: string };
      }>;
      total: number;
    } = await res.json();

    for (const item of data.items || []) {
      playlists.push({
        id: item.id,
        name: item.name,
        description: item.description || "",
        imageUrl: item.images?.[0]?.url || null,
        totalTracks: playlistTrackCount(item),
        ownerName: item.owner?.display_name || "Spotify User",
      });
    }

    offset += data.items?.length ?? 0;
    if (!data.items?.length || offset >= (data.total ?? 0) || playlists.length >= MAX_USER_PLAYLISTS) {
      break;
    }
  }

  return playlists;
}

export async function fetchPlaylistDetails(
  playlistId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<SpotifyPlaylistSummary> {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,items.total,tracks.total,owner.display_name`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Playlist not found or is private.");
    await throwSpotifyApiError(res, "fetch playlist details");
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    description: data.description || "",
    imageUrl: data.images?.[0]?.url || null,
    totalTracks: playlistTrackCount(data),
    ownerName: data.owner?.display_name || "Spotify User",
  };
}

export async function fetchAllPlaylistTracks(
  playlistId: string,
  accessToken: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const tracks: Track[] = [];
  const seenIds = new Set<string>();
  const limit = 50;
  let offset = 0;
  let totalTracks = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal }
    );

    if (!res.ok) {
      await throwSpotifyApiError(res, "fetch playlist tracks");
    }

    const data: {
      items: SpotifyTrackItem[];
      total: number;
    } = await res.json();

    totalTracks = data.total || 0;

    for (const item of data.items || []) {
      const track = trackFromPlaylistRow(item);
      const mapped = track ? mapSpotifyTrackItem(track, seenIds) : null;
      if (mapped) tracks.push(mapped);
    }

    if (onProgress) {
      onProgress(tracks.length, totalTracks);
    }

    const pageSize = data.items?.length ?? 0;
    offset += pageSize;
    if (!pageSize || offset >= totalTracks) {
      break;
    }
  }

  return tracks;
}

function mapSpotifyTrackItem(t: SpotifyTrackPayload, seenIds: Set<string>): Track | null {
  if (!t.id || !t.name || t.is_local) return null;
  if (t.type && t.type !== "track") return null;
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
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const tracks: Track[] = [];
  const seenIds = new Set<string>();
  const limit = 50;
  let offset = 0;
  let totalTracks = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const res = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal }
    );

    if (!res.ok) {
      await throwSpotifyApiError(res, "fetch liked songs");
    }

    const data: {
      items: SpotifyTrackItem[];
      total: number;
    } = await res.json();

    totalTracks = data.total || 0;

    for (const item of data.items || []) {
      const track = trackFromPlaylistRow(item);
      const mapped = track ? mapSpotifyTrackItem(track, seenIds) : null;
      if (mapped) tracks.push(mapped);
    }

    if (onProgress) {
      onProgress(tracks.length, totalTracks);
    }

    if (tracks.length >= MAX_LIKED_SONGS) {
      break;
    }

    const pageSize = data.items?.length ?? 0;
    offset += pageSize;
    if (!pageSize || offset >= totalTracks) {
      break;
    }
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
