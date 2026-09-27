import { describe, expect, it } from "vitest";
import { makeTrack } from "../../test/fixtures";
import type { Track } from "../../types/deck";
import { markVideoEmbedBlocked } from "../youtube/validator";
import {
  formatReadinessPrimary,
  formatReadinessSecondary,
  getDeckReadiness,
  getLargestValidGridSize,
  getMinTracksForGrid,
  getNextDeckName,
  getRecommendedTrackCount,
  isGridSizeValidForDeck,
  type DeckReadiness,
} from "./readiness";

function freshPreview(id: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `https://cdnt-preview.dzcdn.net/stream/${id}?exp=${exp}`;
}

function deezerTrack(id: string, previewUrl: string | null): Track {
  return makeTrack({
    id,
    media: { provider: "deezer", id, previewUrl, previewDurationMs: 30_000 },
  });
}

function readiness(partial: Partial<DeckReadiness>): DeckReadiness {
  return {
    total: 0,
    readyCount: 0,
    matchedCount: 0,
    blockedCount: 0,
    unmatchedCount: 0,
    deferredPreviewCount: 0,
    needsVerificationCount: 0,
    canHost: false,
    health: "empty",
    minHostTracks: 10,
    tooFewForHost: true,
    ...partial,
  };
}

describe("deck readiness", () => {
  it("picks the largest grid the deck can fill and the next default name", () => {
    expect(getMinTracksForGrid(4)).toBe(16);
    expect(getRecommendedTrackCount(5)).toBe(28);
    expect(getRecommendedTrackCount(99)).toBe(36);
    expect(isGridSizeValidForDeck(0, 3)).toBe(false);
    expect(isGridSizeValidForDeck(8, 3)).toBe(false);
    expect(isGridSizeValidForDeck(9, 3)).toBe(true);
    expect(isGridSizeValidForDeck(16, 4)).toBe(true);
    expect(getLargestValidGridSize(0)).toBe(3);
    expect(getLargestValidGridSize(8)).toBe(3);
    expect(getLargestValidGridSize(24)).toBe(4);
    expect(getLargestValidGridSize(36)).toBe(6);

    expect(getNextDeckName(["Party"])).toBe("New deck");
    expect(getNextDeckName(["NEW DECK"])).toBe("New deck 2");
    expect(getNextDeckName(["New deck", "New deck 2"])).toBe("New deck 3");
  });

  it("classifies empty, unmatched, blocked, deferred, and hostable decks", () => {
    expect(getDeckReadiness([]).health).toBe("empty");

    const unmatched = getDeckReadiness([makeTrack({ id: "pending", media: null, matchStatus: "pending" })]);
    expect(unmatched.health).toBe("needs_fix");
    expect(unmatched.unmatchedCount).toBe(1);
    expect(formatReadinessSecondary(unmatched)).toBe("1 need fixing");

    markVideoEmbedBlocked("blockedvid1");
    const blocked = getDeckReadiness([
      makeTrack({ id: "blocked", media: { provider: "youtube", id: "blockedvid1" } }),
    ]);
    expect(blocked.health).toBe("needs_fix");
    expect(blocked.blockedCount).toBe(1);

    const deferred = getDeckReadiness([deezerTrack("dz-1", null)]);
    expect(deferred.health).toBe("previews_pending");
    expect(deferred.deferredPreviewCount).toBe(1);
    expect(deferred.blockedCount).toBe(0);
    expect(formatReadinessPrimary(deferred)).toBe("1/1 matched");
    expect(formatReadinessSecondary(deferred)).toBe("1 Deezer preview load when you click Preview");

    const expired = deezerTrack("dz-old", "https://cdnt-preview.dzcdn.net/stream/old?exp=1000");
    const verifying = makeTrack({
      id: "yt-new",
      media: { provider: "youtube", id: "freshvideoid" },
    });
    const mixed = getDeckReadiness([expired, verifying]);
    expect(mixed.health).toBe("previews_pending");
    expect(formatReadinessPrimary(mixed)).toBe("2/2 matched · verifying…");

    const eight = getDeckReadiness(Array.from({ length: 8 }, (_, index) => deezerTrack(`ready-${index}`, freshPreview(String(index)))));
    expect(eight.health).toBe("too_few");
    expect(eight.canHost).toBe(false);
    expect(formatReadinessSecondary(eight)).toBe("Need 9 songs to print cards · 10 to host");

    const nine = getDeckReadiness(Array.from({ length: 9 }, (_, index) => deezerTrack(`nine-${index}`, freshPreview(`n${index}`))));
    expect(formatReadinessSecondary(nine)).toBe("Need 10 songs to host");

    const twelve = getDeckReadiness(
      Array.from({ length: 12 }, (_, index) => deezerTrack(`host-${index}`, freshPreview(`h${index}`))),
    );
    expect(twelve.health).toBe("ready");
    expect(twelve.canHost).toBe(true);
    expect(formatReadinessPrimary(twelve)).toBe("12/12 ready to play");
    expect(formatReadinessSecondary(twelve)).toBe("A 5×5 card works best with about 28 songs");
  });

  it("describes verification separately from songs that still cannot be hosted", () => {
    const checking = getDeckReadiness([
      makeTrack({ id: "yt-1", media: { provider: "youtube", id: "unverified01" } }),
    ]);
    expect(checking.needsVerificationCount).toBe(1);
    expect(checking.canHost).toBe(false);
    expect(formatReadinessPrimary(checking)).toBe("1/1 matched · verifying…");
    expect(formatReadinessSecondary(checking)).toBe("Checking audio compatibility");

    expect(
      formatReadinessSecondary(
        readiness({
          needsVerificationCount: 2,
          canHost: true,
          readyCount: 12,
          total: 12,
          tooFewForHost: false,
          health: "ready",
        }),
      ),
    ).toBeNull();
    expect(
      formatReadinessSecondary(
        readiness({
          unmatchedCount: 2,
          readyCount: 12,
          total: 14,
          tooFewForHost: false,
          canHost: true,
          health: "needs_fix",
        }),
      ),
    ).toBe("2 unmatched");
  });
});
