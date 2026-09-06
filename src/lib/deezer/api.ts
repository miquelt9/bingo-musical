import { Track } from "../../types/deck";
import { createTrack, defaultDeezerClipWindow } from "../tracks";

const API_URL = (import.meta.env.VITE_SHARE_API_URL ?? "").replace(/\/$/, "");

export interface DeezerTrackHit {
  provider: "deezer";
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string;
  durationMs: number;
  previewUrl: string | null;
  previewDurationMs: number;
  providerUrl: string;
}

export function isDeezerApiConfigured(): boolean {
  return API_URL.length > 0;
}

export function parseDeezerTrackId(input: string): string | null {
  const value = input.trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/deezer\.com$/i.test(url.hostname) && !/\.deezer\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/track\/(\d+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function looksLikeDeezerInput(value: string): boolean {
  return Boolean(parseDeezerTrackId(value));
}

async function fetchJson<T>(path: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("Deezer search is unavailable until the music service is configured.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      let message = `Deezer request failed (${response.status}).`;
      try {
        const body = await response.json() as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message.
      }
      throw new Error(message);
    }
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function mapHit(item: Partial<DeezerTrackHit>): DeezerTrackHit | null {
  const id = typeof item.id === "string" ? item.id : "";
  if (!/^\d+$/.test(id) || !item.title || !item.artist) return null;
  return {
    provider: "deezer",
    id,
    title: item.title,
    artist: item.artist,
    album: item.album || "",
    albumArtUrl: item.albumArtUrl || "",
    durationMs: item.durationMs || 180000,
    previewUrl: item.previewUrl || null,
    previewDurationMs: item.previewDurationMs || (item.previewUrl ? 30000 : 0),
    providerUrl: item.providerUrl || `https://www.deezer.com/track/${id}`,
  };
}

export async function searchDeezerTracks(query: string, limit = 8, signal?: AbortSignal): Promise<DeezerTrackHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const body = await fetchJson<{ data?: Partial<DeezerTrackHit>[] }>(
    `/api/deezer/search?q=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(20, limit))}`,
    signal
  );
  return (body.data || []).map(mapHit).filter((item): item is DeezerTrackHit => item !== null);
}

export async function searchDeezerTracksBatch(
  tracks: Array<Pick<Track, "title" | "artist" | "media">>,
  signal?: AbortSignal
): Promise<DeezerTrackHit[][]> {
  if (tracks.length === 0) return [];
  const results: DeezerTrackHit[][] = [];
  for (let start = 0; start < tracks.length; start += 40) {
    const body = await fetchJson<{ data?: Array<Partial<DeezerTrackHit>[]> }>(
      "/api/deezer/batch-search",
      signal,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songs: tracks.slice(start, start + 40).map((track) => ({
            id: track.media?.provider === "deezer" ? track.media.id : undefined,
            title: track.title,
            artist: track.artist,
          })),
        }),
      }
    );
    results.push(...(body.data || []).map((items) =>
      (items || []).map(mapHit).filter((item): item is DeezerTrackHit => item !== null)
    ));
  }
  return results;
}

export async function resolveDeezerTrack(input: string, signal?: AbortSignal): Promise<DeezerTrackHit> {
  const id = parseDeezerTrackId(input);
  if (!id) throw new Error("Paste a Deezer track URL or numeric track ID.");
  const body = await fetchJson<Partial<DeezerTrackHit>>(`/api/deezer/track/${encodeURIComponent(id)}`, signal);
  const hit = mapHit(body);
  if (!hit) throw new Error("That Deezer track is unavailable.");
  return hit;
}

export async function fetchDeezerRelatedTracks(
  trackId: string,
  limit = 12,
  signal?: AbortSignal
): Promise<DeezerTrackHit[]> {
  const id = parseDeezerTrackId(trackId);
  if (!id) return [];
  const body = await fetchJson<{ data?: Partial<DeezerTrackHit>[] }>(
    `/api/deezer/track/${encodeURIComponent(id)}/related?limit=${Math.max(1, Math.min(20, limit))}`,
    signal
  );
  return (body.data || []).map(mapHit).filter((item): item is DeezerTrackHit => item !== null);
}

export function deezerHitToTrack(hit: DeezerTrackHit): Track {
  const media = {
    provider: "deezer" as const,
    id: hit.id,
    previewUrl: hit.previewUrl,
    previewDurationMs: hit.previewDurationMs || 30000,
    providerUrl: hit.providerUrl,
  };
  const track = createTrack({
    title: hit.title,
    artist: hit.artist,
    album: hit.album,
    albumArtUrl: hit.albumArtUrl,
    durationMs: hit.durationMs,
    media,
    matchStatus: hit.previewUrl ? "matched" : "failed",
  });
  const window = defaultDeezerClipWindow(hit.previewDurationMs || 30000);
  track.startTime = window.startTime;
  track.endTime = window.endTime;
  return track;
}

export function isDeezerTrackPlayable(track: Track): boolean {
  return track.media?.provider === "deezer" && Boolean(track.media.previewUrl);
}

export function deezerClipDurationMs(track: Track): number {
  return track.media?.provider === "deezer"
    ? Math.max(1000, Math.min(30000, track.media.previewDurationMs ?? 30000))
    : 0;
}
