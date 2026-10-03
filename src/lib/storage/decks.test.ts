import { beforeEach, describe, expect, it } from "vitest";
import { getDeckReadiness } from "../decks/readiness";
import { deleteDeck, getStoredDecks, saveStoredDecks } from "./decks";
import { SAMPLE_DEEZER_DECK, SAMPLE_YOUTUBE_DECK } from "./mockDeck";

describe("starter decks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("seeds the YouTube classics deck on a fresh visit and leaves Deezer unhostable", () => {
    const decks = getStoredDecks();

    expect(decks.map((deck) => deck.id)).toEqual([
      SAMPLE_DEEZER_DECK.id,
      SAMPLE_YOUTUBE_DECK.id,
    ]);

    const deezer = decks[0];
    expect(deezer.name).toBe("All-Time Pop & Rock Classics (Deezer)");
    expect(deezer.provider).toBe("deezer");
    expect(deezer.tracks).toHaveLength(30);
    expect(deezer.tracks.every((track, index) => {
      const source = SAMPLE_DEEZER_DECK.tracks[index];
      return track.id === source.id
        && track.title === source.title
        && track.startTime === 0
        && track.endTime === 30
        && track.media?.provider === "deezer"
        && track.media.previewUrl === null;
    })).toBe(true);
    expect(getDeckReadiness(deezer.tracks).canHost).toBe(false);

    const youtube = decks[1];
    expect(youtube.name).toBe("All-Time Pop & Rock Classics (YouTube)");
    expect(youtube.provider).toBe("youtube");
    expect(youtube.tracks).toEqual(SAMPLE_YOUTUBE_DECK.tracks);
    expect(youtube.tracks[0]).toMatchObject({
      title: "Bohemian Rhapsody",
      startTime: 50,
      endTime: 65,
      media: {
        provider: "youtube",
        id: "fJ9rUzIMcZQ",
        providerTitle: "Queen - Bohemian Rhapsody (Official Video)",
      },
    });
    expect(youtube.tracks).toHaveLength(30);
    expect(youtube.tracks.every((track) => (
      track.media?.provider === "youtube"
      && track.media.id.length === 11
      && track.endTime > track.startTime
    ))).toBe(true);
  });

  it("adds the YouTube deck when the browser only has the Deezer starter", () => {
    saveStoredDecks([SAMPLE_DEEZER_DECK]);

    const decks = getStoredDecks();

    expect(decks.map((deck) => deck.id)).toEqual([
      SAMPLE_DEEZER_DECK.id,
      SAMPLE_YOUTUBE_DECK.id,
    ]);
    expect(decks[1].tracks.map((track) => track.media && "id" in track.media ? track.media.id : "")).toEqual(
      SAMPLE_YOUTUBE_DECK.tracks.map((track) => track.media && track.media.provider === "youtube" ? track.media.id : "")
    );
    expect(getStoredDecks().map((deck) => deck.id)).toEqual([
      SAMPLE_DEEZER_DECK.id,
      SAMPLE_YOUTUBE_DECK.id,
    ]);
  });

  it("does not add the YouTube deck to a library that already has other decks", () => {
    const custom = {
      ...SAMPLE_DEEZER_DECK,
      id: "deck-custom",
      name: "My party",
      source: { type: "manual" as const },
    };
    saveStoredDecks([SAMPLE_DEEZER_DECK, custom]);

    expect(getStoredDecks().map((deck) => deck.id)).toEqual([
      SAMPLE_DEEZER_DECK.id,
      custom.id,
    ]);
  });

  it("does not restore the YouTube deck after it is deleted", () => {
    getStoredDecks();
    deleteDeck(SAMPLE_YOUTUBE_DECK.id);

    expect(getStoredDecks().map((deck) => deck.id)).toEqual([SAMPLE_DEEZER_DECK.id]);
    expect(getDeckReadiness(getStoredDecks()[0].tracks).canHost).toBe(false);
  });
});
