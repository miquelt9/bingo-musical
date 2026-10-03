import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { makeDeck, makeTrack } from "../test/fixtures";

vi.mock("@miquelt9/pc-ui", () => ({
  Window: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  ContentModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Modal: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  OverflowMenu: ({
    ariaLabel,
    triggerLabel,
  }: {
    ariaLabel?: string;
    triggerLabel?: string;
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {triggerLabel}
    </button>
  ),
}));

const mobile = vi.hoisted(() => ({ current: false }));

vi.mock("../hooks/useMediaQuery", () => ({
  useIsMobile: () => mobile.current,
}));

vi.mock("../lib/youtube/validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/youtube/validator")>();
  return {
    ...actual,
    validateTracksEmbeddability: vi.fn(async () => undefined),
  };
});

const deckApi = vi.hoisted(() => ({
  decks: [] as ReturnType<typeof makeDeck>[],
  createDeck: vi.fn(),
  deleteDeck: vi.fn(),
  duplicateDeck: vi.fn(),
  shareDeck: vi.fn(),
  backgroundTasks: {} as Record<string, { label: string; completed: number; total: number }>,
}));

vi.mock("../state/DeckContext", () => ({
  useDeck: () => deckApi,
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("desktop deck action names", () => {
  beforeEach(() => {
    mobile.current = false;
    localStorage.setItem("mb_onboarding_dismissed", "1");
    deckApi.decks = [makeDeck([makeTrack({ id: "song-1" })], { id: "deck-party", name: "Party" })];
    deckApi.backgroundTasks = {};
  });

  it("names share, duplicate, and delete without visible label text", () => {
    renderHome();

    for (const name of ["Share deck", "Duplicate deck", "Delete deck"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-label", name);
      expect(button).toHaveTextContent("");
    }
  });

  it("does not add those names on mobile", () => {
    mobile.current = true;
    renderHome();

    expect(screen.queryByRole("button", { name: "Share deck" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate deck" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete deck" })).toBeNull();
    expect(screen.getByRole("button", { name: "More actions for Party" })).toHaveTextContent("More");
    expect(screen.queryByText("Share deck")).toBeNull();
    expect(screen.queryByText("Duplicate deck")).toBeNull();
    expect(screen.queryByText("Delete deck")).toBeNull();
  });
});
