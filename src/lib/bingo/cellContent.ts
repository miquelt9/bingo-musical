import { Track } from "../../types/deck";

export type BingoCellContentKind = "numbers" | "songs" | "authors";

export interface BingoCellContentSelection {
  numbers: boolean;
  songs: boolean;
  authors: boolean;
}

export const CELL_CONTENT_KINDS: readonly BingoCellContentKind[] = [
  "numbers",
  "songs",
  "authors",
] as const;

export const DEFAULT_CELL_CONTENT: BingoCellContentSelection = {
  numbers: true,
  songs: true,
  authors: true,
};

export function cellContentKindLabel(kind: BingoCellContentKind): string {
  switch (kind) {
    case "numbers":
      return "Numbers";
    case "songs":
      return "Songs";
    case "authors":
      return "Authors";
  }
}

export function hasAnyCellContent(selection: BingoCellContentSelection): boolean {
  return selection.numbers || selection.songs || selection.authors;
}

export function normalizeCellContent(
  selection: Partial<BingoCellContentSelection> | null | undefined
): BingoCellContentSelection {
  const next: BingoCellContentSelection = {
    numbers: Boolean(selection?.numbers),
    songs: Boolean(selection?.songs),
    authors: Boolean(selection?.authors),
  };
  return hasAnyCellContent(next) ? next : { ...DEFAULT_CELL_CONTENT };
}

export function toggleCellContent(
  selection: BingoCellContentSelection,
  kind: BingoCellContentKind
): BingoCellContentSelection {
  const next = { ...selection, [kind]: !selection[kind] };
  // Keep at least one option enabled.
  return hasAnyCellContent(next) ? next : selection;
}

/**
 * When authors are shown without song titles, fill cards from unique artists
 * so the same author cannot appear twice via multiple songs.
 */
export function usesAuthorPool(selection: BingoCellContentSelection): boolean {
  return selection.authors && !selection.songs;
}

export function normalizeArtistKey(artist: string): string {
  return artist.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First track per distinct artist, in deck order. */
export function uniqueAuthorTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const track of tracks) {
    const key = normalizeArtistKey(track.artist);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }
  return result;
}

/** Pool used to fill bingo cells for the current content selection. */
export function cellContentPool(tracks: Track[], selection: BingoCellContentSelection): Track[] {
  return usesAuthorPool(selection) ? uniqueAuthorTracks(tracks) : tracks;
}

/** 1-based author number from first appearance in deck order. */
export function getTrackAuthorNumber(tracks: Track[], trackId: string): number | null {
  const authors = uniqueAuthorTracks(tracks);
  const index = authors.findIndex((t) => t.id === trackId);
  if (index >= 0) return index + 1;

  const track = tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const key = normalizeArtistKey(track.artist);
  const byArtist = authors.findIndex((t) => normalizeArtistKey(t.artist) === key);
  return byArtist >= 0 ? byArtist + 1 : null;
}

export function isBingoCellContentSelection(value: unknown): value is BingoCellContentSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.numbers === "boolean" &&
    typeof v.songs === "boolean" &&
    typeof v.authors === "boolean" &&
    hasAnyCellContent({
      numbers: v.numbers,
      songs: v.songs,
      authors: v.authors,
    })
  );
}

/** Parse stored settings (new flags or legacy mode string). */
export function parseStoredCellContent(value: unknown): BingoCellContentSelection | null {
  if (isBingoCellContentSelection(value)) {
    return normalizeCellContent(value);
  }
  if (value === "numbers") {
    return { numbers: true, songs: false, authors: false };
  }
  if (value === "songs") {
    // Legacy "songs" showed title + artist.
    return { numbers: false, songs: true, authors: true };
  }
  if (value === "both") {
    return { numbers: true, songs: true, authors: true };
  }
  return null;
}
