import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeSharePayload, serializeCanonicalPayload } from "../src/lib/share/deckCanonical";
import { defaultDeezerClipWindow } from "../src/lib/tracks";
import { serializeDeckForExport, validateDeckSchema } from "../src/lib/storage/decks";

test("migrates a v1 YouTube export to schema v2 media", () => {
  const result = validateDeckSchema({
    format: "bingo-musical-deck",
    schemaVersion: 1,
    name: "Legacy",
    songs: [{ title: "Song", artist: "Artist", youtube: "https://youtu.be/dQw4w9WgXcQ", start: 3, end: 18 }],
  });
  assert.equal(result.isValid, true);
  assert.equal(result.deck?.schemaVersion, 2);
  assert.equal(result.deck?.provider, "youtube");
  assert.deepEqual(result.deck?.tracks[0].media, { provider: "youtube", id: "dQw4w9WgXcQ" });
});

test("imports and exports Deezer media with its preview URL", () => {
  const result = validateDeckSchema({
    format: "bingo-musical-deck",
    schemaVersion: 2,
    provider: "deezer",
    name: "Deezer deck",
    songs: [{
      title: "Song",
      artist: "Artist",
      start: 0,
      end: 30,
      media: { provider: "deezer", id: "123", previewUrl: "https://example.test/preview.mp3" },
    }],
  });
  assert.equal(result.isValid, true);
  const exported = serializeDeckForExport(result.deck!).exportObject as { provider: string; songs: Array<{ media: { provider: string; id: string; previewUrl: string } }> };
  assert.equal(exported.provider, "deezer");
  assert.equal(exported.songs[0].media.previewUrl, "https://example.test/preview.mp3");
});

test("Deezer clip defaults clamp to the available preview window", () => {
  assert.deepEqual(defaultDeezerClipWindow(), { startTime: 0, endTime: 30 });
  assert.deepEqual(defaultDeezerClipWindow(12000), { startTime: 0, endTime: 12 });
});

test("canonical share payload includes provider media identity but excludes preview URL", () => {
  const first = canonicalizeSharePayload({
    format: "bingo-musical-deck",
    schemaVersion: 2,
    provider: "deezer",
    name: "Deck",
    songs: [{ title: "Song", artist: "Artist", start: 0, end: 30, media: { provider: "deezer", id: "123", previewUrl: "https://one" } }],
  });
  const second = canonicalizeSharePayload({
    format: "bingo-musical-deck",
    schemaVersion: 2,
    provider: "deezer",
    name: "Deck",
    songs: [{ title: "Song", artist: "Artist", start: 0, end: 30, media: { provider: "deezer", id: "123", previewUrl: "https://two" } }],
  });
  assert(first && second);
  assert.equal(serializeCanonicalPayload(first), serializeCanonicalPayload(second));
  const youtube = canonicalizeSharePayload({
    ...JSON.parse(serializeCanonicalPayload(first)),
    provider: "youtube",
    songs: [{ title: "Song", artist: "Artist", start: 0, end: 30, media: { provider: "youtube", id: "dQw4w9WgXcQ" } }],
  });
  assert(youtube);
  assert.notEqual(serializeCanonicalPayload(first), serializeCanonicalPayload(youtube));
});
