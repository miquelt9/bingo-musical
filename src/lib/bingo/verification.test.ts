import { describe, expect, it } from "vitest";
import { makeDeck, makeTrack } from "../../test/fixtures";
import type { BingoCellContentSelection } from "./cellContent";
import { isBlankCell } from "./generateCards";
import {
  computeDeckFingerprintHex,
  decodeCardVerificationCode,
  describeVerifiedClaim,
  encodeCardVerificationCode,
  verifyCardCode,
  type VerifiedClaim,
} from "./verification";

const songsOnly: BingoCellContentSelection = { numbers: false, songs: true, authors: false };

function nineTrackDeck() {
  const tracks = Array.from({ length: 9 }, (_, index) =>
    makeTrack({
      id: `song-${index + 1}`,
      title: `Song ${index + 1}`,
      artist: `Artist ${index + 1}`,
      media: { provider: "youtube", id: `video${String(index + 1).padStart(6, "0")}` },
    }),
  );
  return makeDeck(tracks, { name: "Verification" });
}

describe("card verification codes", () => {
  it("round-trips every content selection and ignores spacing", () => {
    const selections: BingoCellContentSelection[] = [
      { numbers: true, songs: false, authors: false },
      { numbers: false, songs: true, authors: false },
      { numbers: true, songs: true, authors: false },
      { numbers: false, songs: false, authors: true },
      { numbers: true, songs: false, authors: true },
      { numbers: false, songs: true, authors: true },
      { numbers: true, songs: true, authors: true },
    ];

    for (const cellContent of selections) {
      const payload = {
        fingerprintHex: "aabbccdd",
        batchSeed: "11223344",
        cardNumber: 255,
        gridSize: 6,
        bingoPercent: 100,
        cellContent,
      };
      const code = encodeCardVerificationCode(payload);
      expect(code.startsWith("B1-")).toBe(true);
      expect(decodeCardVerificationCode(code)).toEqual({ version: 1, ...payload });
      expect(decodeCardVerificationCode(code.toLowerCase().replace("-", " - "))).toEqual({
        version: 1,
        ...payload,
      });
    }
  });

  it("rejects incomplete, mistyped, and out-of-range codes", () => {
    expect(() => decodeCardVerificationCode("not-a-card")).toThrow(/Musical Bingo card code/);
    expect(() => decodeCardVerificationCode("B1-AAAA")).toThrow(/incomplete/);

    const code = encodeCardVerificationCode({
      fingerprintHex: "aabbccdd",
      batchSeed: "11223344",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 40,
      cellContent: songsOnly,
    });
    const chars = code.split("");
    const index = code.indexOf("-") + 1;
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    chars[index] = alphabet[(alphabet.indexOf(chars[index]) + 1) % alphabet.length];
    expect(() => decodeCardVerificationCode(chars.join(""))).toThrow(/invalid or mistyped/);
    expect(() => decodeCardVerificationCode(`${code.slice(0, 4)}I${code.slice(5)}`)).toThrow(/characters/);

    const base = {
      fingerprintHex: "aabbccdd",
      batchSeed: "11223344",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 40,
      cellContent: songsOnly,
    };
    expect(() => encodeCardVerificationCode({ ...base, cardNumber: 0 })).toThrow(/card number/);
    expect(() => encodeCardVerificationCode({ ...base, cardNumber: 256 })).toThrow(/card number/);
    expect(() => encodeCardVerificationCode({ ...base, gridSize: 2 })).toThrow(/grid size/);
    expect(() => encodeCardVerificationCode({ ...base, bingoPercent: 0 })).toThrow(/Bingo percentage/);
    expect(() => encodeCardVerificationCode({ ...base, batchSeed: "zzzzzzzz" })).toThrow(/batch seed/);
  });

  it("scores a matching card for a line, bingo, and a repeated line prize", async () => {
    const deck = nineTrackDeck();
    const code = encodeCardVerificationCode({
      fingerprintHex: await computeDeckFingerprintHex(deck),
      batchSeed: "00abcdef",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 100,
      cellContent: songsOnly,
    });

    const empty = await verifyCardCode(code, deck, new Set(), false);
    expect(empty.kind).toBe("verified");
    if (empty.kind !== "verified") return;
    expect(empty.bingo).toBe(false);
    expect(empty.lineRows).toEqual([]);
    expect(empty.filledCellCount).toBe(9);
    expect(empty.missingCells).toHaveLength(9);

    const firstRow = empty.card.grid.slice(0, 3).flatMap((cell) => (cell.track ? [cell.track.id] : []));
    const line = await verifyCardCode(code, deck, new Set(firstRow), false);
    expect(line.kind).toBe("verified");
    if (line.kind !== "verified") return;
    expect(line.bingo).toBe(false);
    expect(line.lineRows).toEqual([1]);
    expect(line.lineAccepted).toBe(true);
    expect(line.calledCellCount).toBe(3);

    const awarded = await verifyCardCode(code, deck, new Set(firstRow), true);
    expect(awarded.kind).toBe("verified");
    if (awarded.kind !== "verified") return;
    expect(awarded.lineRows).toEqual([1]);
    expect(awarded.lineAccepted).toBe(false);

    const called = new Set(empty.card.grid.flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    const bingo = await verifyCardCode(code, deck, called, false);
    expect(bingo.kind).toBe("verified");
    if (bingo.kind !== "verified") return;
    expect(bingo.bingo).toBe(true);
    expect(bingo.missingCells).toEqual([]);
    expect(bingo.lineRows).toEqual([1, 2, 3]);
    expect(bingo.lineAccepted).toBe(false);
    expect(bingo.bingoAccepted).toBe(true);
    expect(bingo.card.grid.every((cell) => !isBlankCell(cell))).toBe(true);
  });

  it("does not treat a completed column as a line", async () => {
    const deck = nineTrackDeck();
    const code = encodeCardVerificationCode({
      fingerprintHex: await computeDeckFingerprintHex(deck),
      batchSeed: "00abcdef",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 100,
      cellContent: songsOnly,
    });
    const scored = await verifyCardCode(code, deck, new Set(), false);
    if (scored.kind !== "verified") throw new Error("expected a verified card");
    const column = scored.card.grid
      .filter((_, index) => index % 3 === 0)
      .flatMap((cell) => (cell.track ? [cell.track.id] : []));
    const result = await verifyCardCode(code, deck, new Set(column), false, false);
    expect(result.kind).toBe("verified");
    if (result.kind !== "verified") return;
    expect(column).toHaveLength(3);
    expect(result.lineRows).toEqual([]);
    expect(result.bingo).toBe(false);
    expect(describeVerifiedClaim(result)).toEqual({
      title: "No line or Bingo yet",
      tone: "error",
      award: null,
    } satisfies VerifiedClaim);
  });

  it("scores every prize state", async () => {
    const deck = nineTrackDeck();
    const code = encodeCardVerificationCode({
      fingerprintHex: await computeDeckFingerprintHex(deck),
      batchSeed: "00abcdef",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 100,
      cellContent: songsOnly,
    });
    const empty = await verifyCardCode(code, deck, new Set(), false, false);
    if (empty.kind !== "verified") throw new Error("expected a verified card");
    const firstRow = empty.card.grid.slice(0, 3).flatMap((cell) => (cell.track ? [cell.track.id] : []));
    const allCalled = new Set(empty.card.grid.flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    const oneCell = new Set(firstRow.slice(0, 1));

    const cases: Array<{
      called: ReadonlySet<string>;
      lineAwarded: boolean;
      bingoAwarded: boolean;
      claim: VerifiedClaim;
      missing: boolean;
    }> = [
      {
        called: oneCell,
        lineAwarded: false,
        bingoAwarded: false,
        claim: { title: "No line or Bingo yet", tone: "error", award: null },
        missing: true,
      },
      {
        called: new Set(firstRow),
        lineAwarded: false,
        bingoAwarded: false,
        claim: { title: "Line confirmed", tone: "success", award: "line" },
        missing: true,
      },
      {
        called: new Set(firstRow),
        lineAwarded: true,
        bingoAwarded: false,
        claim: { title: "Line found, but already awarded", tone: "warning", award: null },
        missing: true,
      },
      {
        called: allCalled,
        lineAwarded: false,
        bingoAwarded: false,
        claim: { title: "Bingo confirmed", tone: "success", award: "bingo" },
        missing: false,
      },
      {
        called: allCalled,
        lineAwarded: true,
        bingoAwarded: true,
        claim: { title: "Bingo already awarded", tone: "warning", award: null },
        missing: false,
      },
    ];

    for (const entry of cases) {
      const result = await verifyCardCode(code, deck, entry.called, entry.lineAwarded, entry.bingoAwarded);
      expect(result.kind).toBe("verified");
      if (result.kind !== "verified") continue;
      expect(describeVerifiedClaim(result)).toEqual(entry.claim);
      expect(result.lineAccepted).toBe(entry.claim.award === "line");
      expect(result.bingoAccepted).toBe(entry.claim.award === "bingo");
      expect(result.missingCells.length > 0).toBe(entry.missing);
      if (entry.claim.award === "bingo") {
        expect(result.lineRows.length).toBeGreaterThan(0);
        expect(result.lineAccepted).toBe(false);
      }
    }
  });

  it("marks an author cell called when any song by that artist was called", async () => {
    const tracks = [
      makeTrack({ id: "a1", title: "One", artist: "Alpha", media: { provider: "youtube", id: "authorvid01" } }),
      makeTrack({ id: "a2", title: "Two", artist: "  alpha ", media: { provider: "youtube", id: "authorvid02" } }),
      makeTrack({ id: "b1", title: "Three", artist: "Beta", media: { provider: "youtube", id: "authorvid03" } }),
    ];
    const deck = makeDeck(tracks);
    const code = encodeCardVerificationCode({
      fingerprintHex: await computeDeckFingerprintHex(deck),
      batchSeed: "abc12345",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 100,
      cellContent: { numbers: false, songs: false, authors: true },
    });

    const result = await verifyCardCode(code, deck, new Set(["a2"]), false);
    expect(result.kind).toBe("verified");
    if (result.kind !== "verified") return;
    expect(result.calledCellCount).toBe(1);
    expect(result.missingCells.map((cell) => cell.artist)).toEqual(["Beta"]);
    expect(result.bingo).toBe(false);
  });

  it("rejects a code minted for a different deck and a code that cannot be read", async () => {
    const deck = nineTrackDeck();
    const code = encodeCardVerificationCode({
      fingerprintHex: await computeDeckFingerprintHex(deck),
      batchSeed: "00abcdef",
      cardNumber: 1,
      gridSize: 3,
      bingoPercent: 100,
      cellContent: songsOnly,
    });
    const edited = makeDeck(
      deck.tracks.map((track, index) => (index === 0 ? { ...track, title: "Changed" } : track)),
      { name: deck.name },
    );

    const mismatch = await verifyCardCode(code, edited, new Set(), false);
    expect(mismatch.kind).toBe("deck-mismatch");
    if (mismatch.kind === "deck-mismatch") {
      expect(mismatch.expectedFingerprintHex).toHaveLength(8);
      expect(mismatch.payload.cardNumber).toBe(1);
    }

    const invalid = await verifyCardCode("nope", deck, new Set(), false);
    expect(invalid).toEqual({
      kind: "invalid-code",
      message: "This is not a Musical Bingo card code.",
    });
  });
});
