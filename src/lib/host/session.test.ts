import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import {
  buildDisplayStateFromSession,
  getDisplayChannelName,
  readHostSessionRaw,
  type HostSessionData,
} from "./session";

const tracks = [
  makeTrack({ id: "a", title: "First", artist: "Ada", albumArtUrl: "https://art.example/a.jpg" }),
  makeTrack({ id: "b", title: "Second", artist: "Bea", albumArtUrl: "https://art.example/b.jpg" }),
];

function session(partial: Partial<HostSessionData> = {}): HostSessionData {
  return {
    uncalledIds: ["b"],
    calledHistory: [],
    currentCall: null,
    isRevealed: false,
    autoCallNextOnEnd: false,
    autoRevealOnEnd: false,
    ...partial,
  };
}

describe("host display state", () => {
  it("names the display channel and ignores unreadable session storage", () => {
    expect(getDisplayChannelName("deck 1")).toBe("bingo.host.display.deck 1");
    expect(readHostSessionRaw("missing")).toBeNull();

    sessionStorage.setItem(
      "bingo.host.session.deck-1",
      JSON.stringify(session({ uncalledIds: ["a"] })),
    );
    expect(readHostSessionRaw("deck-1")?.uncalledIds).toEqual(["a"]);
    sessionStorage.setItem("bingo.host.session.deck-2", "{");
    expect(readHostSessionRaw("deck-2")).toBeNull();
  });

  it("hides the answer until the host reveals the current call", () => {
    expect(buildDisplayStateFromSession(session(), [])).toBeNull();
    expect(buildDisplayStateFromSession(session(), tracks)).toMatchObject({
      callNumber: 0,
      totalCount: 2,
      calledCount: 0,
      title: null,
      artist: null,
      songNumber: null,
      isPlaying: false,
    });

    const currentCall = { callNumber: 4, trackId: "b", calledAt: "2025-01-01T00:00:00.000Z" };
    const hidden = buildDisplayStateFromSession(
      session({ currentCall, calledHistory: [currentCall] }),
      tracks,
    );
    expect(hidden).toMatchObject({
      callNumber: 4,
      calledCount: 1,
      isRevealed: false,
      title: null,
      artist: null,
      albumArtUrl: null,
      songNumber: null,
    });

    const revealed = buildDisplayStateFromSession(
      session({ currentCall, calledHistory: [currentCall], isRevealed: true }),
      tracks,
      { isPlaying: true, progress: 0.4 },
    );
    expect(revealed).toMatchObject({
      isRevealed: true,
      isPlaying: true,
      progress: 0.4,
      songNumber: 2,
      title: "Second",
      artist: "Bea",
      albumArtUrl: "https://art.example/b.jpg",
    });

    expect(
      buildDisplayStateFromSession(
        session({ currentCall: { ...currentCall, trackId: "missing" } }),
        tracks,
      ),
    ).toBeNull();
  });
});
