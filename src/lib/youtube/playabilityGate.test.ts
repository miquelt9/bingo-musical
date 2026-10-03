import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import type { Track } from "../../types/deck";
import { canStartGame, getPlayabilityIssues } from "./playabilityGate";

function deezerTrack(id: string, previewUrl: string | null, matchStatus: Track["matchStatus"] = "pending"): Track {
  return makeTrack({
    id,
    matchStatus,
    media: { provider: "deezer", id, previewUrl, previewDurationMs: 30_000 },
  });
}

describe("playability gate and deferred Deezer previews", () => {
  it("does not wait for every signed preview before a deck can be hosted", () => {
    const tracks = Array.from({ length: 12 }, (_, index) => deezerTrack(`dz-${index}`, null));

    expect(canStartGame(tracks)).toBe(true);
    expect(getPlayabilityIssues(tracks)).toEqual([]);
  });

  it("still blocks a Deezer track that failed to match", () => {
    const tracks = [deezerTrack("dz-failed", null, "failed")];

    expect(canStartGame(tracks)).toBe(false);
    expect(getPlayabilityIssues(tracks).map((entry) => entry.reason)).toEqual([
      "No Deezer preview is available",
    ]);
  });
});
