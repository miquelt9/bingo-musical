import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HostPage } from "./HostPage";
import { makeDeck, makeTrack } from "../test/fixtures";
import { HOST_SESSION_KEY } from "../lib/host/session";

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
      <h2>{title}</h2>
      {children}
    </div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Window: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Split: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../hooks/useMediaQuery", () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useMediaQuery: () => false,
}));

vi.mock("../state/PlayerUIContext", () => ({
  usePlayerUI: () => ({ showVideo: false, toggleVideo: vi.fn() }),
}));

vi.mock("../state/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const deckApi = vi.hoisted(() => ({
  decks: [] as ReturnType<typeof makeDeck>[],
  isLoading: false,
  loadDeck: vi.fn(),
  updateDeck: vi.fn(),
  updateTrackInDeck: vi.fn(),
}));

vi.mock("../state/DeckContext", () => ({
  useDeck: () => deckApi,
}));

const tracks = Array.from({ length: 10 }, (_, index) =>
  makeTrack({
    id: `song-${index + 1}`,
    title: `Song ${index + 1}`,
    artist: `Artist ${index + 1}`,
    media: {
      provider: "deezer",
      id: `dz-${index + 1}`,
      previewUrl: `https://cdn.example/preview-${index + 1}.mp3`,
      previewDurationMs: 30000,
    },
  }),
);

const deck = makeDeck(tracks, { id: "deck-party", name: "Party", provider: "deezer" });

function seedSession(prizes: { lineAwarded?: boolean; bingoAwarded?: boolean }) {
  const call = { callNumber: 1, trackId: tracks[0].id, calledAt: "12:00:00" };
  sessionStorage.setItem(
    `${HOST_SESSION_KEY}.${deck.id}`,
    JSON.stringify({
      uncalledIds: tracks.slice(1).map((item) => item.id),
      calledHistory: [call],
      currentCall: call,
      isRevealed: true,
      autoCallNextOnEnd: true,
      autoRevealOnEnd: true,
      lineAwarded: prizes.lineAwarded ?? false,
      bingoAwarded: prizes.bingoAwarded ?? false,
    }),
  );
}

function renderHost() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deck.id}/play`]}>
      <Routes>
        <Route path="/deck/:id/play" element={<HostPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("host prize restore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    deckApi.decks = [deck];
    deckApi.isLoading = false;
    deckApi.loadDeck.mockReset();
    deckApi.updateDeck.mockReset();
    deckApi.updateTrackInDeck.mockReset();
  });

  it("restore keeps bingoAwarded", async () => {
    seedSession({ lineAwarded: true, bingoAwarded: true });
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "Continue Game" }));

    expect(await screen.findByText("Bingo awarded")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Call Next Song" })).toBeEnabled();
    });
    const stored = JSON.parse(sessionStorage.getItem(`${HOST_SESSION_KEY}.${deck.id}`) ?? "{}") as {
      bingoAwarded?: boolean;
      lineAwarded?: boolean;
    };
    expect(stored.bingoAwarded).toBe(true);
    expect(stored.lineAwarded).toBe(true);
  });

  it("starts a new game with both prizes open", async () => {
    seedSession({ lineAwarded: true, bingoAwarded: true });
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "Start New Game" }));

    expect(screen.queryByText("Bingo awarded")).not.toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem(`${HOST_SESSION_KEY}.${deck.id}`) ?? "{}") as {
      bingoAwarded?: boolean;
      lineAwarded?: boolean;
    };
    expect(stored.bingoAwarded).toBe(false);
    expect(stored.lineAwarded).toBe(false);
  });

  it("reset clears both awarded flags and still allows the next call", async () => {
    seedSession({ lineAwarded: true, bingoAwarded: true });
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "Continue Game" }));
    expect(await screen.findByText("Bingo awarded")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reset Bingo" }));
    const dialog = screen.getByRole("dialog", { name: "Reset Game?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset Bingo" }));

    await waitFor(() => {
      expect(screen.queryByText("Bingo awarded")).not.toBeInTheDocument();
    });
    const stored = JSON.parse(sessionStorage.getItem(`${HOST_SESSION_KEY}.${deck.id}`) ?? "null") as {
      bingoAwarded?: boolean;
      lineAwarded?: boolean;
    } | null;
    expect(stored?.bingoAwarded ?? false).toBe(false);
    expect(stored?.lineAwarded ?? false).toBe(false);
  });
});
