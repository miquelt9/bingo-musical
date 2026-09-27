import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import {
  cellContentKindLabel,
  cellContentPool,
  getTrackAuthorNumber,
  normalizeArtistKey,
  normalizeCellContent,
  normalizeCellContentSizes,
  parseStoredCellContent,
  toggleCellContent,
  uniqueAuthorTracks,
  usesAuthorPool,
} from "./cellContent";

describe("bingo cell content", () => {
  it("keeps at least one content type selected", () => {
    expect(normalizeCellContent(null)).toEqual({ numbers: true, songs: true, authors: true });
    expect(normalizeCellContent({ numbers: false, songs: false, authors: false })).toEqual({
      numbers: true,
      songs: true,
      authors: true,
    });

    const songsOnly = { numbers: false, songs: true, authors: false };
    expect(toggleCellContent(songsOnly, "numbers")).toEqual({ numbers: true, songs: true, authors: false });
    expect(toggleCellContent(songsOnly, "songs")).toEqual(songsOnly);
  });

  it("parses current flags and legacy mode strings", () => {
    expect(parseStoredCellContent("numbers")).toEqual({ numbers: true, songs: false, authors: false });
    expect(parseStoredCellContent("songs")).toEqual({ numbers: false, songs: true, authors: true });
    expect(parseStoredCellContent("both")).toEqual({ numbers: true, songs: true, authors: true });
    expect(parseStoredCellContent({ numbers: true, songs: false, authors: true })).toEqual({
      numbers: true,
      songs: false,
      authors: true,
    });
    expect(parseStoredCellContent({ numbers: false, songs: false, authors: false })).toBeNull();
    expect(parseStoredCellContent("titles")).toBeNull();
  });

  it("clamps stored text sizes and labels each kind", () => {
    expect(normalizeCellContentSizes({ numbers: 5, songs: 500, authors: Number.NaN })).toEqual({
      numbers: 10,
      songs: 200,
      authors: 100,
    });
    expect(cellContentKindLabel("authors")).toBe("Authors");
  });

  it("fills author cards from the first track of each distinct artist", () => {
    const tracks = [
      makeTrack({ id: "a1", artist: "  Alpha   Band " }),
      makeTrack({ id: "a2", artist: "alpha band" }),
      makeTrack({ id: "blank", artist: "   " }),
      makeTrack({ id: "b1", artist: "Beta" }),
    ];

    expect(normalizeArtistKey("  Alpha   Band ")).toBe("alpha band");
    expect(uniqueAuthorTracks(tracks).map((track) => track.id)).toEqual(["a1", "b1"]);
    expect(usesAuthorPool({ numbers: false, songs: false, authors: true })).toBe(true);
    expect(usesAuthorPool({ numbers: false, songs: true, authors: true })).toBe(false);
    expect(cellContentPool(tracks, { numbers: false, songs: false, authors: true }).map((track) => track.id)).toEqual([
      "a1",
      "b1",
    ]);
    expect(getTrackAuthorNumber(tracks, "a2")).toBe(1);
    expect(getTrackAuthorNumber(tracks, "b1")).toBe(2);
    expect(getTrackAuthorNumber(tracks, "missing")).toBeNull();
  });
});
