import { describe, expect, it } from "vitest";
import type { Track } from "../../types/deck";
import { makeDeck, makeTrack } from "../../test/fixtures";
import {
  SHARE_ID_LENGTH,
  buildCanonicalSharePayload,
  canonicalPayloadsEqual,
  canonicalizeSharePayload,
  computeShareId,
  serializeCanonicalPayload,
} from "./deckCanonical";

describe("canonical deck share payloads", () => {
  it("trims deck fields and keeps the stable media id", () => {
    const deck = makeDeck(
      [
        makeTrack({
          id: "t1",
          title: "  Song  ",
          artist: "  Artist  ",
          album: "  Album  ",
          albumArtUrl: "  https://art.example/a.jpg  ",
          startTime: 12,
          endTime: 40,
          media: { provider: "youtube", id: "dQw4w9WgXcQ" },
        }),
      ],
      { name: "  Party Mix  ", provider: "youtube" },
    );

    expect(buildCanonicalSharePayload(deck)).toEqual({
      format: "bingo-musical-deck",
      schemaVersion: 2,
      provider: "youtube",
      name: "Party Mix",
      songs: [
        {
          title: "Song",
          artist: "Artist",
          album: "Album",
          albumArtUrl: "https://art.example/a.jpg",
          start: 12,
          end: 40,
          media: { provider: "youtube", id: "dQw4w9WgXcQ" },
        },
      ],
    });
  });

  it("promotes a legacy youtube id when the track has no media object", () => {
    const track = makeTrack({ id: "t1", media: null }) as Track & { youtubeVideoId?: string };
    track.youtubeVideoId = "dQw4w9WgXcQ";

    expect(buildCanonicalSharePayload(makeDeck([track])).songs[0].media).toEqual({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
    });
  });

  it("round-trips a v2 payload and ignores blank optional fields", () => {
    const payload = buildCanonicalSharePayload(
      makeDeck(
        [makeTrack({ id: "t1", album: "   ", albumArtUrl: "", media: { provider: "deezer", id: "42", previewUrl: null } })],
        { provider: "deezer", name: "Deezer Night" },
      ),
    );

    const restored = canonicalizeSharePayload(JSON.parse(serializeCanonicalPayload(payload)));
    expect(restored).not.toBeNull();
    expect(canonicalPayloadsEqual(payload, restored!)).toBe(true);
    expect(payload.songs[0].album).toBeUndefined();
    expect(payload.songs[0].media).toEqual({ provider: "deezer", id: "42" });
  });

  it("accepts legacy v1 songs and playlist-style track lists", () => {
    const legacy = canonicalizeSharePayload({
      format: "bingo-musical-deck",
      schemaVersion: 1,
      name: " Old ",
      songs: [
        {
          title: " Song ",
          artist: " Artist ",
          startTime: 10,
          endTime: 10,
          url: "https://youtu.be/dQw4w9WgXcQ?t=30",
        },
      ],
    });

    expect(legacy).toMatchObject({
      schemaVersion: 1,
      provider: "youtube",
      name: "Old",
      songs: [
        {
          title: "Song",
          artist: "Artist",
          start: 10,
          end: 11,
          youtube: "dQw4w9WgXcQ",
        },
      ],
    });
    expect(serializeCanonicalPayload(legacy!)).not.toContain("provider");
    expect(serializeCanonicalPayload(legacy!)).toContain("dQw4w9WgXcQ");

    const fromTracks = canonicalizeSharePayload({
      format: "bingo-musical-deck",
      schemaVersion: 2,
      provider: "deezer",
      name: "Party",
      tracks: [{ title: "Song", artist: "Artist", start: 0, end: 15 }],
    });
    expect(fromTracks?.songs).toEqual([
      { title: "Song", artist: "Artist", start: 0, end: 15 },
    ]);
  });

  it("drops media that belongs to a different provider", () => {
    const payload = canonicalizeSharePayload({
      format: "bingo-musical-deck",
      schemaVersion: 2,
      provider: "deezer",
      name: "Party",
      songs: [
        {
          title: "Song",
          artist: "Artist",
          media: { provider: "youtube", id: "dQw4w9WgXcQ" },
        },
      ],
    });

    expect(payload?.provider).toBe("deezer");
    expect(payload?.songs[0].media).toBeUndefined();
    expect(payload?.songs[0].start).toBe(0);
    expect(payload?.songs[0].end).toBe(30);
  });

  it("rejects payloads that cannot be imported", () => {
    expect(canonicalizeSharePayload(null)).toBeNull();
    expect(canonicalizeSharePayload({ format: "other", name: "Party", songs: [{ title: "A", artist: "B" }] })).toBeNull();
    expect(
      canonicalizeSharePayload({
        format: "bingo-musical-deck",
        schemaVersion: 2,
        provider: "spotify",
        name: "Party",
        songs: [{ title: "A", artist: "B" }],
      }),
    ).toBeNull();
    expect(
      canonicalizeSharePayload({
        format: "bingo-musical-deck",
        name: "   ",
        songs: [{ title: "A", artist: "B" }],
      }),
    ).toBeNull();
    expect(
      canonicalizeSharePayload({
        format: "bingo-musical-deck",
        schemaVersion: 2,
        provider: "youtube",
        name: "Party",
        songs: [
          { title: "A", artist: "B" },
          { title: " ", artist: "C" },
        ],
      }),
    ).toBeNull();
  });

  it("derives a stable 10-character share id from the canonical JSON", async () => {
    const payload = buildCanonicalSharePayload(makeDeck([makeTrack({ id: "t1", title: "Song", artist: "Artist" })]));
    const shareId = await computeShareId(payload);

    expect(shareId).toHaveLength(SHARE_ID_LENGTH);
    expect(shareId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await computeShareId(payload)).toBe(shareId);
    expect(await computeShareId({ ...payload, name: `${payload.name}!` })).not.toBe(shareId);
    expect(canonicalPayloadsEqual(payload, { ...payload })).toBe(true);
    expect(canonicalPayloadsEqual(payload, { ...payload, name: "Other" })).toBe(false);
  });
});
