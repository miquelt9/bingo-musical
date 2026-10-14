import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeDeck, makeTrack } from "../../test/fixtures";
import type { BingoCellContentSelection } from "../../lib/bingo/cellContent";
import {
  computeDeckFingerprintHex,
  encodeCardVerificationCode,
  verifyCardCode,
} from "../../lib/bingo/verification";
import { CardVerificationModal } from "./CardVerificationModal";

vi.mock("@miquelt9/pc-ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ContentModal: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

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

async function cardCode() {
  const deck = nineTrackDeck();
  const code = encodeCardVerificationCode({
    fingerprintHex: await computeDeckFingerprintHex(deck),
    batchSeed: "00abcdef",
    cardNumber: 1,
    gridSize: 3,
    bingoPercent: 100,
    cellContent: songsOnly,
  });
  const scored = await verifyCardCode(code, deck, new Set(), false, false);
  if (scored.kind !== "verified") throw new Error("expected a verified card");
  return { deck, code, card: scored.card };
}

async function renderVerified(
  code: string,
  deck: ReturnType<typeof nineTrackDeck>,
  calledTrackIds: ReadonlySet<string>,
  prizes: { lineAwarded?: boolean; bingoAwarded?: boolean } = {},
) {
  const onAcceptLine = vi.fn();
  const onAcceptBingo = vi.fn();
  render(
    <CardVerificationModal
      deck={deck}
      calledTrackIds={calledTrackIds}
      lineAwarded={prizes.lineAwarded ?? false}
      bingoAwarded={prizes.bingoAwarded ?? false}
      onAcceptLine={onAcceptLine}
      onAcceptBingo={onAcceptBingo}
      onClose={vi.fn()}
    />,
  );
  await userEvent.type(screen.getByLabelText("Card code"), code);
  await userEvent.click(screen.getByRole("button", { name: "Verify" }));
  return { onAcceptLine, onAcceptBingo };
}

describe("card verification modal prizes", () => {
  it("shows a false claim with missing songs and no award button", async () => {
    const { deck, code, card } = await cardCode();
    const called = new Set(card.grid[0]?.track ? [card.grid[0].track.id] : []);
    await renderVerified(code, deck, called);

    expect(await screen.findByText("No line or Bingo yet")).toHaveClass("text-pc-error");
    expect(screen.getByText("Still missing:")).toBeInTheDocument();
    expect(screen.getAllByText(/Song \d+/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Award line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Award Bingo" })).not.toBeInTheDocument();
  });

  it("offers Award line while the line prize is open", async () => {
    const { deck, code, card } = await cardCode();
    const called = new Set(card.grid.slice(0, 3).flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    const { onAcceptLine } = await renderVerified(code, deck, called);

    expect(await screen.findByText("Line confirmed")).toHaveClass("text-emerald-700");
    await userEvent.click(screen.getByRole("button", { name: "Award line" }));
    expect(onAcceptLine).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Award Bingo" })).not.toBeInTheDocument();
  });

  it("keeps the existing copy when the line prize is already awarded", async () => {
    const { deck, code, card } = await cardCode();
    const called = new Set(card.grid.slice(0, 3).flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    await renderVerified(code, deck, called, { lineAwarded: true });

    expect(await screen.findByText("Line found, but already awarded")).toHaveClass("text-pc-warning");
    expect(screen.getByText(/single line prize has already been awarded/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Award line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Award Bingo" })).not.toBeInTheDocument();
  });

  it("offers Award Bingo and not Award line when the card is Bingo and the line is still open", async () => {
    const { deck, code, card } = await cardCode();
    const called = new Set(card.grid.flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    const { onAcceptBingo, onAcceptLine } = await renderVerified(code, deck, called);

    expect(await screen.findByText("Bingo confirmed")).toHaveClass("text-emerald-700");
    await userEvent.click(screen.getByRole("button", { name: "Award Bingo" }));
    expect(onAcceptBingo).toHaveBeenCalledOnce();
    expect(onAcceptLine).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Award line" })).not.toBeInTheDocument();
  });

  it("shows Bingo already awarded in the warning colour with no button", async () => {
    const { deck, code, card } = await cardCode();
    const called = new Set(card.grid.flatMap((cell) => (cell.track ? [cell.track.id] : [])));
    await renderVerified(code, deck, called, { lineAwarded: true, bingoAwarded: true });

    expect(await screen.findByText("Bingo already awarded")).toHaveClass("text-pc-warning");
    expect(screen.queryByRole("button", { name: "Award line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Award Bingo" })).not.toBeInTheDocument();
  });

  it("keeps the invalid code and deck mismatch messages", async () => {
    const { deck, code } = await cardCode();
    const { unmount } = render(
      <CardVerificationModal
        deck={deck}
        calledTrackIds={new Set()}
        lineAwarded={false}
        bingoAwarded={false}
        onAcceptLine={vi.fn()}
        onAcceptBingo={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText("Card code"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("This is not a Musical Bingo card code.")).toBeInTheDocument();
    unmount();

    const edited = makeDeck(
      deck.tracks.map((track, index) => (index === 0 ? { ...track, title: "Changed" } : track)),
      { name: deck.name },
    );
    render(
      <CardVerificationModal
        deck={edited}
        calledTrackIds={new Set()}
        lineAwarded={false}
        bingoAwarded={false}
        onAcceptLine={vi.fn()}
        onAcceptBingo={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText("Card code"), code);
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Different deck version")).toBeInTheDocument();
    expect(screen.getByText(/different version of the current deck/)).toBeInTheDocument();
  });
});
